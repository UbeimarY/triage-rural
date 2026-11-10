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
  /** Set when the server refused the operation for good: it is not sent again. */
  rejectedCode?: string;
}

/**
 * The server had a newer version of a visit than the one this edit was based on.
 * Both copies are kept until the promoter decides: health data is never overwritten silently.
 */
export interface SyncConflict {
  encounterId: string;
  serverVersion: number;
  serverRecord: Pick<Encounter, 'symptoms' | 'alarms' | 'updatedAt' | 'version'>;
  detectedAt: string;
}

export type Priority = 'high' | 'medium' | 'low';
export type TriageSource = 'rules' | 'model';

/** Stable codes: the UI translates them into Spanish. */
export type TriageReasonCode = 'ALARM_SIGNS_PRESENT' | 'NO_ALARM_SIGNS' | 'MODEL_PREDICTION';

/** A word of the symptoms note and how much it weighed in the model's suggestion. */
export interface Evidence {
  /** UTF-16 offsets into the symptoms text. */
  start: number;
  end: number;
  /** Written as absent ("sin fiebre", "niega dolor"). */
  negated: boolean;
  /** Push toward the suggested priority: positive supports it, negative argues against it. */
  weight: number;
}

export interface TriageResult {
  priority: Priority;
  source: TriageSource;
  triggeredAlarms: (keyof AlarmAnswers)[];
  reasonCodes: TriageReasonCode[];
  /** Null while the decision comes only from rules. */
  modelVersion: string | null;
  /** Model decisions only: probability of each priority. */
  probabilities?: Record<Priority, number>;
  /** Model decisions only: the words that weighed the most (the explanation). */
  topTerms?: string[];
  /** Model decisions only: every content word with its weight, to highlight the note. */
  evidence?: Evidence[];
  /** False when the model knew none of the words, so it kept the safe default. */
  knownText?: boolean;
  /**
   * Alarm questions left unmarked although the note mentions them ("le duele el pecho"):
   * the app asks the promoter to check them. They never raise the priority on their own.
   */
  followUps?: (keyof AlarmAnswers)[];
  elapsedMs: number;
}

/** The stored result for a visit, tied to the exact version it evaluated. */
export interface TriageAssessment extends TriageResult {
  encounterId: string;
  encounterVersion: number;
  createdAt: string;
  /** Priority confirmed or changed by the health promoter: the AI never decides alone. */
  finalPriority?: Priority;
  /** Required when the promoter lowers the suggested priority. */
  reviewNote?: string;
  reviewedAt?: string;
}
