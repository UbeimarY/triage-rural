import { Priority, TriageAssessment } from '../db/models';
import { effectivePriority, isLowering, sortByAttention } from './priority-order';

function visit(id: string, createdAt: string, priority?: Priority, finalPriority?: Priority) {
  const assessment = priority
    ? ({ priority, finalPriority } as TriageAssessment)
    : undefined;
  return { id, encounter: { createdAt }, assessment };
}

describe('priority order', () => {
  it('should put high first, then unclassified, then medium and low', () => {
    const sorted = sortByAttention([
      visit('low', '2026-10-06T08:00:00Z', 'low'),
      visit('medium', '2026-10-06T08:00:00Z', 'medium'),
      visit('pending', '2026-10-06T08:00:00Z'),
      visit('high', '2026-10-06T08:00:00Z', 'high'),
    ]);

    expect(sorted.map((v) => v.id)).toEqual(['high', 'pending', 'medium', 'low']);
  });

  it('should serve whoever has waited longest first within the same priority', () => {
    const sorted = sortByAttention([
      visit('later', '2026-10-06T10:00:00Z', 'high'),
      visit('earlier', '2026-10-06T08:00:00Z', 'high'),
    ]);

    expect(sorted.map((v) => v.id)).toEqual(['earlier', 'later']);
  });

  it('should let the promoter decision override the suggestion', () => {
    const sorted = sortByAttention([
      visit('suggested-high-lowered', '2026-10-06T08:00:00Z', 'high', 'low'),
      visit('medium', '2026-10-06T09:00:00Z', 'medium'),
    ]);

    expect(sorted.map((v) => v.id)).toEqual(['medium', 'suggested-high-lowered']);
    expect(effectivePriority({ priority: 'medium', finalPriority: 'high' } as TriageAssessment)).toBe('high');
  });

  it('should detect when a priority is being lowered', () => {
    expect(isLowering('high', 'medium')).toBe(true);
    expect(isLowering('medium', 'high')).toBe(false);
    expect(isLowering('low', 'low')).toBe(false);
  });
});

