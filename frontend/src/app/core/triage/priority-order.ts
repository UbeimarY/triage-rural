import { Priority, TriageAssessment } from '../db/models';

export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Rank used for visits that are still being classified: right after "high". */
const UNCLASSIFIED_RANK = 0.5;

/** The promoter's decision wins over the automatic suggestion. */
export function effectivePriority(assessment?: TriageAssessment): Priority | undefined {
  return assessment ? (assessment.finalPriority ?? assessment.priority) : undefined;
}

/** True when the chosen priority is less urgent than the suggested one. */
export function isLowering(suggested: Priority, chosen: Priority): boolean {
  return PRIORITY_RANK[chosen] > PRIORITY_RANK[suggested];
}

interface Orderable {
  encounter: { createdAt: string };
  assessment?: TriageAssessment;
}

/**
 * Attention order: most urgent first. Unclassified visits go right after "high",
 * so an unknown case is never hidden at the bottom. Within the same level,
 * whoever has been waiting the longest comes first.
 */
export function sortByAttention<T extends Orderable>(visits: readonly T[]): T[] {
  const rank = (visit: T): number => {
    const priority = effectivePriority(visit.assessment);
    return priority === undefined ? UNCLASSIFIED_RANK : PRIORITY_RANK[priority];
  };
  return [...visits].sort(
    (a, b) => rank(a) - rank(b) || a.encounter.createdAt.localeCompare(b.encounter.createdAt),
  );
}
