import { InjectionToken } from '@angular/core';
import Dexie, { type EntityTable } from 'dexie';
import { Encounter, OutboxOperation, Patient, TriageAssessment } from './models';

export class TriageDatabase extends Dexie {
  patients!: EntityTable<Patient, 'id'>;
  encounters!: EntityTable<Encounter, 'id'>;
  outbox!: EntityTable<OutboxOperation, 'id'>;
  assessments!: EntityTable<TriageAssessment, 'encounterId'>;

  constructor(name = 'triage-rural') {
    super(name);
    // Schema version 1. Future changes add version(2) with an upgrade function,
    // so data already stored on the phones is migrated, never lost.
    // Only indexed fields are listed here; every object can hold more properties.
    this.version(1).stores({
      patients: 'id, code, syncStatus, updatedAt',
      encounters: 'id, patientId, syncStatus, updatedAt',
      outbox: 'id, createdAt, entityId',
    });

        // Version 2: adds triage assessments (one per visit). Existing data is kept.
    this.version(2).stores({
      assessments: 'encounterId, priority',
    });
    
  }
}

/** Injection token so tests can provide an isolated database. */
export const TRIAGE_DB = new InjectionToken<TriageDatabase>('TRIAGE_DB', {
  providedIn: 'root',
  factory: () => new TriageDatabase(),
});

