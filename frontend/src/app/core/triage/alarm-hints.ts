import { AlarmAnswers } from '../db/models';
import { Token } from './text-model';

/**
 * Word beginnings that, written as present, suggest an alarm question deserves a second look.
 * They only prompt the promoter to answer the question: free text never triggers an alarm,
 * because "no tiene dificultad para respirar" must not become an emergency.
 */
const MENTIONS: Record<keyof AlarmAnswers, readonly string[]> = {
  breathingDifficulty: ['respir', 'ahog', 'asfix', 'aire', 'jadea', 'morad'],
  lossOfConsciousness: ['desmay', 'desvanec', 'inconscien', 'conocimiento'],
  chestPain: ['pecho', 'torax', 'infart'],
  severeBleeding: ['sangr', 'hemorrag'],
  seizures: ['convuls', 'ataque', 'espasm'],
};

export function alarmFollowUps(tokens: Token[], alarms: AlarmAnswers): (keyof AlarmAnswers)[] {
  const affirmed = tokens.filter((token) => !token.negated).map((token) => token.text);
  return (Object.keys(MENTIONS) as (keyof AlarmAnswers)[]).filter(
    (key) =>
      !alarms[key] && MENTIONS[key].some((stem) => affirmed.some((word) => word.startsWith(stem))),
  );
}
