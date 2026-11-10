import { NO_ALARMS } from './alarm-signs';
import { TRIAGE_TEXT_MODEL } from './model';
import { classify } from './triage-engine';

describe('classify', () => {
  it('should return high priority when any alarm sign is present', () => {
    const result = classify({
      symptoms: 'Le cuesta respirar desde la mañana',
      alarms: { ...NO_ALARMS, breathingDifficulty: true, chestPain: true },
    });

    expect(result.priority).toBe('high');
    expect(result.source).toBe('rules');
    expect(result.triggeredAlarms).toEqual(['breathingDifficulty', 'chestPain']);
  });

  it('should never downgrade a case without alarms below medium for now', () => {
    const result = classify({ symptoms: 'Tos leve desde hace dos días', alarms: NO_ALARMS });

    expect(result.priority).toBe('medium');
    expect(result.reasonCodes).toEqual(['NO_ALARM_SIGNS']);
  });

  it('should not trigger alarms from negated words in free text', () => {
    const result = classify({ symptoms: 'No tiene dificultad para respirar', alarms: NO_ALARMS });

    expect(result.priority).not.toBe('high');
  });
});

describe('classify with the text model', () => {
  it('lets alarm rules override the model', () => {
    const result = classify(
      { symptoms: 'Viene a control de rutina', alarms: { ...NO_ALARMS, seizures: true } },
      TRIAGE_TEXT_MODEL,
    );

    expect(result.priority).toBe('high');
    expect(result.source).toBe('rules');
  });

  it('uses the model when there are no alarm signs, with its version and explanation', () => {
    const result = classify(
      { symptoms: 'Fiebre muy alta con rigidez en el cuello', alarms: NO_ALARMS },
      TRIAGE_TEXT_MODEL,
    );

    expect(result.source).toBe('model');
    expect(result.priority).toBe('high');
    expect(result.modelVersion).toBe('triage-text-v2');
    expect(result.reasonCodes).toEqual(['MODEL_PREDICTION']);
  });

  it('asks again about an alarm the note mentions but the promoter left unmarked', () => {
    const result = classify(
      { symptoms: 'Le duele el pecho desde anoche y sangra por la nariz', alarms: NO_ALARMS },
      TRIAGE_TEXT_MODEL,
    );

    expect(result.followUps).toEqual(['chestPain', 'severeBleeding']);
  });

  it('does not ask about an alarm the note denies or the promoter already marked', () => {
    const result = classify(
      {
        symptoms: 'Niega dolor de pecho, sangra un poco por una herida',
        alarms: { ...NO_ALARMS, severeBleeding: true },
      },
      TRIAGE_TEXT_MODEL,
    );

    expect(result.followUps).toEqual([]);
  });
});
