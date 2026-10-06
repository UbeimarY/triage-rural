import { AlarmAnswers, TriageResult } from '../db/models';

/** Message sent from the page to the worker. */
export interface TriageRequest {
  requestId: string;
  symptoms: string;
  alarms: AlarmAnswers;
  /** Demo only: artificial CPU work to prove the UI is never blocked. */
  simulatedWorkMs: number;
}

/** Message sent back from the worker. */
export type TriageResponse =
  | { requestId: string; ok: true; result: TriageResult }
  | { requestId: string; ok: false; error: string };

  