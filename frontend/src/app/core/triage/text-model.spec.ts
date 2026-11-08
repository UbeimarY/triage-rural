import fixtures from './model/equivalence-fixtures.json';
import { TRIAGE_TEXT_MODEL } from './model';
import { analyze, decide, predict } from './text-model';

describe('text model', () => {
  it('reproduces the probabilities Python computed, case by case', () => {
    expect(fixtures.version).toBe(TRIAGE_TEXT_MODEL.version);

    for (const { text, probabilities } of fixtures.cases) {
      const prediction = predict(TRIAGE_TEXT_MODEL, text);
      fixtures.classes.forEach((name, i) => {
        const value = prediction.probabilities[name as 'high' | 'medium' | 'low'];
        expect(Math.abs(value - probabilities[i]), `${name} for "${text}"`).toBeLessThan(1e-6);
      });
    }
  });

  it('tokenizes like scikit-learn: lowercase, no accents, unigrams then bigrams', () => {
    expect(analyze('Dolor de CABEZA, ñandú!')).toEqual([
      'dolor',
      'de',
      'cabeza',
      'nandu',
      'dolor de',
      'de cabeza',
      'cabeza nandu',
    ]);
  });

  it('flags a clearly urgent description as high', () => {
    const prediction = predict(
      TRIAGE_TEXT_MODEL,
      'Lo mordió una culebra en el pie y se le está hinchando mucho',
    );

    expect(prediction.priority).toBe('high');
    expect(prediction.topTerms.length).toBeGreaterThan(0);
  });

  it('explains with meaningful words, never with function words alone', () => {
    const { topTerms } = predict(
      TRIAGE_TEXT_MODEL,
      'Tos con flema verde y fiebre desde hace una semana',
    );

    expect(topTerms).not.toContain('con');
    expect(topTerms.length).toBeGreaterThan(0);
  });

  it('keeps a routine visit low', () => {
    expect(
      predict(TRIAGE_TEXT_MODEL, 'Viene a control de la presión, se siente bien').priority,
    ).toBe('low');
  });

  it('chooses high once its probability reaches the threshold, even if it is not the largest', () => {
    expect(decide({ high: 0.3, medium: 0.6, low: 0.1 }, 0.25)).toBe('high');
    expect(decide({ high: 0.1, medium: 0.3, low: 0.6 }, 0.25)).toBe('low');
  });
});
