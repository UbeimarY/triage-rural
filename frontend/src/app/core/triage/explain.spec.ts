import { certaintyLevel, explainResult } from './explain';

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
      modelVersion: 'triage-text-v1',
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
