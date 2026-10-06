import { AlarmAnswers } from '../db/models';

/**
 * Alarm signs asked as explicit yes/no questions.
 * They are NOT detected from free text: "no tengo dificultad para respirar"
 * must never trigger an alarm. Labels are UI text, so they are in Spanish.
 */
export const ALARM_SIGNS: readonly { key: keyof AlarmAnswers; label: string; shortLabel: string }[] = [
  { key: 'breathingDifficulty', label: '¿Tiene dificultad para respirar?', shortLabel: 'dificultad para respirar' },
  { key: 'lossOfConsciousness', label: '¿Perdió el conocimiento o se desmayó?', shortLabel: 'pérdida de conocimiento' },
  { key: 'chestPain', label: '¿Tiene dolor fuerte en el pecho?', shortLabel: 'dolor fuerte en el pecho' },
  { key: 'severeBleeding', label: '¿Tiene un sangrado abundante?', shortLabel: 'sangrado abundante' },
  { key: 'seizures', label: '¿Ha tenido convulsiones?', shortLabel: 'convulsiones' },
];

export const NO_ALARMS: AlarmAnswers = {
  breathingDifficulty: false,
  lossOfConsciousness: false,
  chestPain: false,
  severeBleeding: false,
  seizures: false,
};

export function countAlarms(alarms: AlarmAnswers): number {
  return Object.values(alarms).filter(Boolean).length;
}
