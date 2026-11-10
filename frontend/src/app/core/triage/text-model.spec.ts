import fixtures from './model/equivalence-fixtures.json';
import { TRIAGE_TEXT_MODEL } from './model';
import { analyze, decide, normalize, predict, tokenize } from './text-model';

const model = TRIAGE_TEXT_MODEL;

function highlighted(text: string): { word: string; negated: boolean; weight: number }[] {
  return predict(model, text).evidence.map((item) => ({
    word: text.slice(item.start, item.end),
    negated: item.negated,
    weight: item.weight,
  }));
}

describe('text model', () => {
  it('builds the same features Python built, case by case', () => {
    expect(fixtures.version).toBe(model.version);
    for (const { text, features } of fixtures.cases) {
      expect(analyze(model, text), text).toEqual(features);
    }
  });

  it('reproduces the probabilities Python computed, case by case', () => {
    for (const { text, probabilities } of fixtures.cases) {
      const prediction = predict(model, text);
      fixtures.classes.forEach((name, i) => {
        const value = prediction.probabilities[name as 'high' | 'medium' | 'low'];
        expect(Math.abs(value - probabilities[i]), `${name} for "${text}"`).toBeLessThan(1e-6);
      });
    }
  });

  it('keeps one character per character typed, so highlights land on the right word', () => {
    const text = 'Niega DOLOR 😷 en el pécho';
    expect(normalize(text)).toHaveLength(text.length);
    const pecho = tokenize(text, model.settings).find((token) => token.text === 'pecho')!;
    expect(text.slice(pecho.start, pecho.end)).toBe('pécho');
  });

  it('marks denied findings, but not a "no" that describes the symptom', () => {
    const marks = Object.fromEntries(
      tokenize('Sin fiebre, pero no puede respirar bien', model.settings).map((t) => [
        t.text,
        t.negated,
      ]),
    );
    expect(marks['fiebre']).toBe(true);
    expect(marks['respirar']).toBe(false);
  });

  it('does not call a note that only denies urgent findings high', () => {
    for (const text of [
      'Niega dolor de pecho',
      'Sin rigidez en el cuello',
      'No tiene dificultad para respirar ni convulsiones',
    ]) {
      expect(predict(model, text).priority, text).not.toBe('high');
    }
  });

  it('still recognises an urgent case written with typos', () => {
    expect(predict(model, 'lo mordio una culevra en el pie y se esta inchando').priority).toBe(
      'high',
    );
  });

  it('flags a clearly urgent description as high and explains it with its own words', () => {
    const text = 'Lo mordió una culebra en el pie y se le está hinchando mucho';
    const prediction = predict(model, text);

    expect(prediction.priority).toBe('high');
    expect(prediction.topTerms).toContain('culebra');
    expect(highlighted(text).find((item) => item.word === 'culebra')!.weight).toBeGreaterThan(0);
  });

  it('never highlights function words', () => {
    const words = highlighted('Tos con flema verde y fiebre desde hace una semana').map(
      (item) => item.word,
    );
    expect(words).not.toContain('con');
    expect(words).toContain('fiebre');
  });

  it('keeps a routine visit low', () => {
    expect(predict(model, 'Viene a control de la presión, se siente bien').priority).toBe('low');
  });

  it('falls back to medium when it knows none of the words', () => {
    const prediction = predict(model, 'xyzzy qwrtp');
    expect(prediction.known).toBe(false);
    expect(prediction.priority).toBe('medium');
  });

  it('chooses high once its probability reaches the threshold, even if it is not the largest', () => {
    expect(decide({ high: 0.3, medium: 0.6, low: 0.1 }, 0.25)).toBe('high');
    expect(decide({ high: 0.1, medium: 0.3, low: 0.6 }, 0.25)).toBe('low');
  });
});
