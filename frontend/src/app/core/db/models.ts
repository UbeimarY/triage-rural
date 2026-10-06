export type Sex = 'female' | 'male' | 'other';

/** Local technical state of a record. It is never clinical information. */
export type SyncStatus = 'pending' | 'synced' | 'error';

export interface AlarmAnswers {
  breathingDifficulty: boolean;
  lossOfConsciousness: boolean;
  chestPain: boolean;
  severeBleeding: boolean;
  seizures: boolean;
}

/** Minimal patient data: no names, documents or phone numbers (data minimization). */
export interface Patient {
  id: string;
  code: string;
  birthYear: number;
  sex: Sex;
  community: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

/** A visit: one patient can have several encounters over time. */
export interface Encounter {
  id: string;
  patientId: string;
  symptoms: string;
  alarms: AlarmAnswers;
  consentGiven: boolean;
  createdAt: string;
  updatedAt: string;
  /** Incremented on every edit; the server uses it to detect conflicts. */
  version: number;
  syncStatus: SyncStatus;
}

export type OutboxEntity = 'patient' | 'encounter' | 'assessment';
export type OutboxOperationType = 'create' | 'update';

/** A pending change waiting to be sent to the server (outbox pattern). */
export interface OutboxOperation {
  id: string;
  entity: OutboxEntity;
  entityId: string;
  type: OutboxOperationType;
  payload: Record<string, unknown>;
  /** For updates: the version this edit was based on. */
  baseVersion?: number;
  createdAt: string;
  attempts: number;
}

export type Priority = 'high' | 'medium' | 'low';
export type TriageSource = 'rules' | 'model';

/** Stable codes: the UI translates them into Spanish. */
export type TriageReasonCode = 'ALARM_SIGNS_PRESENT' | 'NO_ALARM_SIGNS';

export interface TriageResult {
  priority: Priority;
  source: TriageSource;
  triggeredAlarms: (keyof AlarmAnswers)[];
  reasonCodes: TriageReasonCode[];
  /** Null while the decision comes only from rules. */
  modelVersion: string | null;
  elapsedMs: number;
}

/** The stored result for a visit, tied to the exact version it evaluated. */
export interface TriageAssessment extends TriageResult {
  encounterId: string;
  encounterVersion: number;
  createdAt: string;
}

