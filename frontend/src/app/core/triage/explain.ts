import { TriageResult } from '../db/models';
import { ALARM_SIGNS } from './alarm-signs';

/**
 * Plain-language explanation of a triage result, shared by the patient list
 * and the live preview in the form.
 *
 * The model's probability is shown as a level, not a percentage: it was trained
 * on synthetic notes, so "100 %" would promise a certainty it does not have.
 */
export function certaintyLevel(probability: number): 'alta' | 'media' | 'baja' {
  if (probability >= 0.9) return 'alta';
  return probability >= 0.7 ? 'media' : 'baja';
}

export function explainResult(result: TriageResult): string {
  if (result.triggeredAlarms.length > 0) {
    const names = result.triggeredAlarms.map(
      (key) => ALARM_SIGNS.find((sign) => sign.key === key)?.shortLabel ?? key,
    );
    return `⚠ Regla de alarma: ${names.join(', ')}`;
  }
  if (result.source === 'model' && result.probabilities) {
    const level = certaintyLevel(result.probabilities[result.priority]);
    const terms = result.topTerms?.length ? ` por «${result.topTerms.join('», «')}»` : '';
    const caution = level === 'baja' ? ': revísala con cuidado' : '';
    return `Sugerencia de la IA${terms} · certeza ${level}${caution}`;
  }
  return 'Sin signos de alarma · prioridad provisional, revísala según tu criterio';
}
