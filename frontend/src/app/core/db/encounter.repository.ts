import { Injectable, inject } from '@angular/core';
import { liveQuery } from 'dexie';
import { Observable, from } from 'rxjs';
import { newId } from '../ids';
import {
  AlarmAnswers,
  Encounter,
  OutboxEntity,
  OutboxOperation,
  OutboxOperationType,
  Patient,
  Priority,
  Sex,
  TriageAssessment,
  TriageResult,
} from './models';
import { TRIAGE_DB } from './triage-db';
import { isLowering } from '../triage/priority-order';

export interface NewVisitInput {
  birthYear: number;
  sex: Sex;
  community: string;
  symptoms: string;
  alarms: AlarmAnswers;
  consentGiven: boolean;
}

export interface EncounterChanges {
  symptoms: string;
  alarms: AlarmAnswers;
}

export interface VisitSummary {
  patient: Patient;
  encounter: Encounter;
  /** Only present when it matches the current version of the visit. */
  assessment?: TriageAssessment;
}

@Injectable({ providedIn: 'root' })
export class EncounterRepository {
  private readonly db = inject(TRIAGE_DB);

  /** Registers a new patient with their first visit. Works with or without internet. */
  async registerVisit(input: NewVisitInput): Promise<VisitSummary> {
    if (!input.consentGiven) {
      throw new Error('CONSENT_REQUIRED');
    }

    const now = new Date().toISOString();
    const patientId = newId();

    const patient: Patient = {
      id: patientId,
      code: toPatientCode(patientId),
      birthYear: input.birthYear,
      sex: input.sex,
      community: input.community.trim(),
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };

    const encounter: Encounter = {
      id: newId(),
      patientId,
      symptoms: input.symptoms.trim(),
      alarms: { ...input.alarms },
      consentGiven: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
      syncStatus: 'pending',
    };

    // Atomic write: the records and their pending operations are saved together, or not at all.
    await this.db.transaction('rw', [this.db.patients, this.db.encounters, this.db.outbox], async () => {
      await this.db.patients.add(patient);
      await this.db.encounters.add(encounter);
      await this.db.outbox.bulkAdd([
        createOperation('patient', 'create', patient.id, toPayload(patient)),
        createOperation('encounter', 'create', encounter.id, toPayload(encounter)),
      ]);
    });

    void requestPersistentStorage();
    return { patient, encounter };
  }

  /** Edits the clinical part of a visit. Patient data stays unchanged. */
  async updateEncounter(id: string, changes: EncounterChanges): Promise<Encounter> {
    return this.db.transaction('rw', [this.db.encounters, this.db.outbox], async () => {
      const current = await this.db.encounters.get(id);
      if (!current) {
        throw new Error('ENCOUNTER_NOT_FOUND');
      }

      const updated: Encounter = {
        ...current,
        symptoms: changes.symptoms.trim(),
        alarms: { ...changes.alarms },
        updatedAt: new Date().toISOString(),
        version: current.version + 1,
        syncStatus: 'pending',
      };

      await this.db.encounters.put(updated);
      await this.db.outbox.add(
        createOperation('encounter', 'update', updated.id, toPayload(updated), current.version),
      );
      return updated;
    });
  }

  /**
   * Stores the triage result for a visit. Returns false and discards the result
   * if the visit was edited while it was being classified (stale result).
   */
  async saveAssessment(encounterId: string, encounterVersion: number, result: TriageResult): Promise<boolean> {
    return this.db.transaction('rw', [this.db.encounters, this.db.assessments, this.db.outbox], async () => {
      const encounter = await this.db.encounters.get(encounterId);
      if (!encounter || encounter.version !== encounterVersion) {
        return false;
      }


      const existing = await this.db.assessments.get(encounterId);
      const assessment: TriageAssessment = {
        ...result,
        encounterId,
        encounterVersion,
        createdAt: new Date().toISOString(),
      };

      await this.db.assessments.put(assessment);
      await this.db.outbox.add(
        createOperation('assessment', existing ? 'update' : 'create', encounterId, { ...assessment }),
      );
      return true;
    });
  }

    /**
   * Records the promoter's decision about the suggested priority.
   * Lowering the suggestion requires a written reason.
   */
  async reviewAssessment(
    encounterId: string,
    encounterVersion: number,
    finalPriority: Priority,
    note: string,
  ): Promise<TriageAssessment> {
    return this.db.transaction('rw', [this.db.assessments, this.db.outbox], async () => {
      const current = await this.db.assessments.get(encounterId);
      if (!current || current.encounterVersion !== encounterVersion) {
        throw new Error('ASSESSMENT_OUTDATED');
      }

      const reason = note.trim();
      if (isLowering(current.priority, finalPriority) && reason.length < 5) {
        throw new Error('REVIEW_NOTE_REQUIRED');
      }

      const reviewed: TriageAssessment = {
        ...current,
        finalPriority,
        reviewNote: reason || undefined,
        reviewedAt: new Date().toISOString(),
      };

      await this.db.assessments.put(reviewed);
      await this.db.outbox.add(createOperation('assessment', 'update', encounterId, { ...reviewed }));
      return reviewed;
    });
  }

  /** Visits without a result for their current version (e.g. the app closed mid-classification). */
  async encountersNeedingTriage(): Promise<Encounter[]> {
    const encounters = await this.db.encounters.toArray();
    const assessments = await this.db.assessments.bulkGet(encounters.map((e) => e.id));
    return encounters.filter((e, i) => assessments[i]?.encounterVersion !== e.version);
  }

  async getVisit(encounterId: string): Promise<VisitSummary | undefined> {
    const encounter = await this.db.encounters.get(encounterId);
    if (!encounter) return undefined;
    const patient = await this.db.patients.get(encounter.patientId);
    return patient ? { patient, encounter } : undefined;
  }

  /** Live list of visits, newest first. Emits again every time the data changes. */
  watchVisits(): Observable<VisitSummary[]> {
    return from(
      liveQuery(async () => {
        const encounters = await this.db.encounters.orderBy('updatedAt').reverse().toArray();
        const patients = await this.db.patients.bulkGet([...new Set(encounters.map((e) => e.patientId))]);
        const assessments = await this.db.assessments.bulkGet(encounters.map((e) => e.id));

        const patientsById = new Map<string, Patient>();
        for (const patient of patients) {
          if (patient) patientsById.set(patient.id, patient);
        }

        const visits: VisitSummary[] = [];
        encounters.forEach((encounter, i) => {
          const patient = patientsById.get(encounter.patientId);
          if (!patient) return;
          const assessment = assessments[i];
          visits.push({
            patient,
            encounter,
            assessment: assessment?.encounterVersion === encounter.version ? assessment : undefined,
          });
        });
        return visits;
      }),
    );
  }

  /** Live count of operations waiting to be synchronized. */
  watchPendingCount(): Observable<number> {
    return from(liveQuery(() => this.db.outbox.count()));
  }
}

/** Short, non-identifying code shown in the UI instead of a name. */
function toPatientCode(id: string): string {
  return `P-${id.slice(0, 6).toUpperCase()}`;
}

/** syncStatus is local information: it is never sent to the server. */
function toPayload(record: Patient | Encounter): Record<string, unknown> {
  const { syncStatus, ...payload } = record;
  return { ...payload };
}

function createOperation(
  entity: OutboxEntity,
  type: OutboxOperationType,
  entityId: string,
  payload: Record<string, unknown>,
  baseVersion?: number,
): OutboxOperation {
  return {
    id: newId(),
    entity,
    entityId,
    type,
    payload,
    baseVersion,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
}

/** Asks the browser not to evict our data when the device runs low on storage. */
async function requestPersistentStorage(): Promise<void> {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    await navigator.storage.persist();
  } catch {
    // Not supported or denied: the app keeps working with best-effort storage
  }
}
