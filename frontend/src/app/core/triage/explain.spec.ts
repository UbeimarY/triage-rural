import { TriageResult } from '../db/models';
import { certaintyLevel, explainResult, needsMoreDetail, noteSegments } from './explain';

describe('explainResult', () => {
  it('names the alarm signs when a rule decided', () => {
    expect(
      explainResult({
        priority: 'high',
        source: 'rules',
        triggeredAlarms: ['chestPain'],
        reasonCodes: ['ALARM_SIGNS_PRESENT'],
        modelVersion: null,
        elapsedMs: 1,
      }),
    ).toBe('⚠ Regla de alarma: dolor fuerte en el pecho');
  });

  it('shows the model certainty as a level, never as 100 %', () => {
    const text = explainResult({
      priority: 'medium',
      source: 'model',
      triggeredAlarms: [],
      reasonCodes: ['MODEL_PREDICTION'],
      modelVersion: 'triage-text-v2',
      probabilities: { high: 0.001, medium: 0.998, low: 0.001 },
      topTerms: ['fiebre'],
      elapsedMs: 2,
    });
    expect(text).toBe('Sugerencia de la IA por «fiebre» · certeza alta');
    expect(text).not.toContain('%');
  });

  it('asks for care when the model is unsure', () => {
    expect(certaintyLevel(0.55)).toBe('baja');
    expect(certaintyLevel(0.75)).toBe('media');
  });
});

describe('noteSegments', () => {
  const result: TriageResult = {
    priority: 'high',
    source: 'model',
    triggeredAlarms: [],
    reasonCodes: ['MODEL_PREDICTION'],
    modelVersion: 'triage-text-v2',
    probabilities: { high: 0.8, medium: 0.15, low: 0.05 },
    evidence: [
      { start: 0, end: 6, negated: false, weight: 0.9 },
      { start: 11, end: 17, negated: true, weight: 0 },
      { start: 18, end: 22, negated: false, weight: 0.01 },
    ],
    elapsedMs: 1,
  };

  it('splits the note into highlighted and plain pieces that rebuild it exactly', () => {
    const text = 'Vomita sin fiebre hoy';
    const segments = noteSegments(text, result);

    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments).toEqual([
      { text: 'Vomita', role: 'for' },
      { text: ' sin ', role: 'plain' },
      { text: 'fiebre', role: 'denied' },
      { text: ' hoy', role: 'plain' },
    ]);
  });

  it('asks for more detail only when the model is unsure or knows no words', () => {
    expect(needsMoreDetail(result)).toBe(false);
    expect(
      needsMoreDetail({ ...result, probabilities: { high: 0.4, medium: 0.35, low: 0.25 } }),
    ).toBe(true);
    expect(needsMoreDetail({ ...result, knownText: false })).toBe(true);
  });
});
