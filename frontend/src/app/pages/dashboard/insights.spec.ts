import { readableMinutes, stackColumns } from './insights';

describe('stackColumns', () => {
  const daily = [
    { day: '2026-11-09', high: 1, medium: 0, low: 1, unclassified: 0 },
    { day: '2026-11-10', high: 2, medium: 1, low: 1, unclassified: 0 },
  ];

  it('scales every column to the busiest day and stacks alta at the base', () => {
    const { columns, max } = stackColumns(daily, 200, 100, 0);

    expect(max).toBe(4);
    expect(columns[1].segments.map((s) => s.series)).toEqual(['high', 'medium', 'low']);
    expect(columns[1].segments[0].y).toBe(50);
    expect(columns[1].segments.at(-1)!.y).toBe(0);
  });

  it('caps the bar width so the bars never fill their slot', () => {
    expect(stackColumns(daily, 2000, 100).barWidth).toBe(24);
  });
});

describe('readableMinutes', () => {
  it('speaks in minutes, hours or days', () => {
    expect(readableMinutes(0.4)).toBe('menos de 1 min');
    expect(readableMinutes(12.2)).toBe('12 min');
    expect(readableMinutes(300)).toBe('5 h');
    expect(readableMinutes(4000)).toBe('3 días');
    expect(readableMinutes(null)).toBe('—');
  });
});
