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
  if (result.source === 'model' && result.knownText === false) {
    return 'La IA no reconoce estas palabras: queda en prioridad media hasta que la revises';
  }
  if (result.source === 'model' && result.probabilities) {
    const level = certaintyLevel(result.probabilities[result.priority]);
    const terms = result.topTerms?.length ? ` por «${result.topTerms.join('», «')}»` : '';
    const caution = level === 'baja' ? ': revísala con cuidado' : '';
    return `Sugerencia de la IA${terms} · certeza ${level}${caution}`;
  }
  return 'Sin signos de alarma · prioridad provisional, revísala según tu criterio';
}

/** What the promoter can add to the note when the model is unsure. */
export const DETAIL_PROMPTS: readonly string[] = [
  'Desde cuándo empezó',
  'Si está empeorando',
  'Qué tan fuerte es (leve, moderado, fuerte)',
  'Temperatura, si la tomaste',
];

export function needsMoreDetail(result: TriageResult): boolean {
  if (result.source !== 'model' || !result.probabilities) return false;
  return (
    result.knownText === false || certaintyLevel(result.probabilities[result.priority]) === 'baja'
  );
}

export interface NoteSegment {
  text: string;
  /** 'for' supports the suggestion, 'against' argues against it, 'denied' was written as absent. */
  role: 'plain' | 'for' | 'against' | 'denied';
}

/**
 * Splits the note into pieces to highlight. Small weights are left plain so the
 * highlight shows only what really moved the suggestion.
 */
export function noteSegments(text: string, result: TriageResult, minWeight = 0.05): NoteSegment[] {
  const marks = (result.evidence ?? [])
    .filter((item) => item.end <= text.length)
    .map((item) => ({
      ...item,
      role: item.negated
        ? ('denied' as const)
        : item.weight >= minWeight
          ? ('for' as const)
          : item.weight <= -minWeight
            ? ('against' as const)
            : ('plain' as const),
    }))
    .filter((item) => item.role !== 'plain')
    .sort((a, b) => a.start - b.start);

  const segments: NoteSegment[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) segments.push({ text: text.slice(cursor, mark.start), role: 'plain' });
    segments.push({ text: text.slice(mark.start, mark.end), role: mark.role });
    cursor = mark.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), role: 'plain' });
  return segments;
}
