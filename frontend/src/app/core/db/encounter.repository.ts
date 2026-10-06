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
  Sex,
} from './models';
import { TRIAGE_DB } from './triage-db';

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
        createOperation('patient', 'create', patient),
        createOperation('encounter', 'create', encounter),
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
      await this.db.outbox.add(createOperation('encounter', 'update', updated, current.version));
      return updated;
    });
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
        const patientIds = [...new Set(encounters.map((e) => e.patientId))];
        const patients = await this.db.patients.bulkGet(patientIds);
        const byId = new Map<string, Patient>();
        for (const patient of patients) {
          if (patient) byId.set(patient.id, patient);
        }
        return encounters
          .filter((e) => byId.has(e.patientId))
          .map((e) => ({ encounter: e, patient: byId.get(e.patientId)! }));
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

function createOperation(
  entity: OutboxEntity,
  type: OutboxOperationType,
  record: Patient | Encounter,
  baseVersion?: number,
): OutboxOperation {
  // syncStatus is local information: it is never sent to the server
  const { syncStatus, ...payload } = record;
  return {
    id: newId(),
    entity,
    entityId: record.id,
    type,
    payload: { ...payload },
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
