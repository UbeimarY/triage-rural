import { AlarmAnswers, TriageResult } from '../db/models';
import { TriageRequest } from './triage-protocol';

type Classification = Omit<TriageResult, 'elapsedMs'>;

/**
 * Pure triage logic. It has no Angular dependencies, so it can run
 * inside the web worker and also be unit-tested directly.
 * Rules always take precedence: the text model (step 14) will only
 * decide cases without alarm signs.
 */
export function classify(input: Pick<TriageRequest, 'symptoms' | 'alarms'>): Classification {
  const triggeredAlarms = (Object.keys(input.alarms) as (keyof AlarmAnswers)[]).filter(
    (key) => input.alarms[key],
  );

  if (triggeredAlarms.length > 0) {
    return {
      priority: 'high',
      source: 'rules',
      triggeredAlarms,
      reasonCodes: ['ALARM_SIGNS_PRESENT'],
      modelVersion: null,
    };
  }

  // Provisional until the model exists: without alarms we never downgrade to "low".
  return {
    priority: 'medium',
    source: 'rules',
    triggeredAlarms: [],
    reasonCodes: ['NO_ALARM_SIGNS'],
    modelVersion: null,
  };
}

/** Runs the classification, including the optional demo load. Used by worker and fallback. */
export function runClassification(request: TriageRequest): TriageResult {
  const started = performance.now();
  busyWait(request.simulatedWorkMs);
  const result = classify(request);
  return { ...result, elapsedMs: Math.round(performance.now() - started) };
}

/** Blocks the current thread on purpose (demo only). */
function busyWait(ms: number): void {
  if (ms <= 0) return;
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // intentionally busy
  }
}
