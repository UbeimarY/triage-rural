import { AlarmAnswers, TriageResult } from '../db/models';
import { alarmFollowUps } from './alarm-hints';
import { predict, TextModel, tokenize } from './text-model';
import { TriageRequest } from './triage-protocol';

type Classification = Omit<TriageResult, 'elapsedMs'>;

/**
 * Pure triage logic: no Angular dependencies, so it runs inside the web worker
 * and is unit-tested directly.
 *
 * Safety layers, in order:
 *  1. Alarm-sign rules (explicit yes/no questions) always win: any alarm means high.
 *  2. Without alarms, the on-device text model suggests a priority.
 *  3. The health promoter reviews every suggestion (see reviewAssessment).
 *
 * Alarm questions the note mentions but the promoter left unmarked come back as
 * follow-ups: the app asks again, it never marks them itself.
 */
export function classify(
  input: Pick<TriageRequest, 'symptoms' | 'alarms'>,
  model?: TextModel,
): Classification {
  const triggeredAlarms = (Object.keys(input.alarms) as (keyof AlarmAnswers)[]).filter(
    (key) => input.alarms[key],
  );

  const followUps = model
    ? alarmFollowUps(tokenize(input.symptoms, model.settings), input.alarms)
    : [];

  if (triggeredAlarms.length > 0) {
    return {
      priority: 'high',
      source: 'rules',
      triggeredAlarms,
      reasonCodes: ['ALARM_SIGNS_PRESENT'],
      modelVersion: null,
      followUps,
    };
  }

  if (model) {
    const prediction = predict(model, input.symptoms);
    return {
      priority: prediction.priority,
      source: 'model',
      triggeredAlarms: [],
      reasonCodes: ['MODEL_PREDICTION'],
      modelVersion: model.version,
      probabilities: prediction.probabilities,
      topTerms: prediction.topTerms,
      evidence: prediction.evidence,
      knownText: prediction.known,
      followUps,
    };
  }

  // No model available: never downgrade a case without alarms below medium.
  return {
    priority: 'medium',
    source: 'rules',
    triggeredAlarms: [],
    reasonCodes: ['NO_ALARM_SIGNS'],
    modelVersion: null,
  };
}

/** Runs the classification, including the optional demo load. Used by worker and fallback. */
export function runClassification(request: TriageRequest, model?: TextModel): TriageResult {
  const started = performance.now();
  busyWait(request.simulatedWorkMs);
  const result = classify(request, model);
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
