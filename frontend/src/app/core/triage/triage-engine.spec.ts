import { NO_ALARMS } from './alarm-signs';
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

