import { describe, it, expect } from 'vitest';
import { unionSpans, mergeSpansByKey, type DateSpan } from '@/services/dashboard-spans';

const span = (startDate: string, endDate: string | null): DateSpan => ({ startDate, endDate });

/** Every ordering of an array (n! of them). */
function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])
  );
}

describe('unionSpans', () => {
  it('returns [] for no spans', () => {
    expect(unionSpans([])).toEqual([]);
  });

  it('merges overlapping spans to the earliest start and the latest end', () => {
    expect(unionSpans([
      span('2025-11-01T00:00:00', '2026-02-01T00:00:00'),
      span('2025-10-15T00:00:00', '2026-01-01T00:00:00'),
    ])).toEqual([span('2025-10-15T00:00:00', '2026-02-01T00:00:00')]);
  });

  it('absorbs a contained span and keeps the outer end', () => {
    expect(unionSpans([
      span('2025-01-01T00:00:00', '2025-12-31T00:00:00'),
      span('2025-03-01T00:00:00', '2025-04-01T00:00:00'),
    ])).toEqual([span('2025-01-01T00:00:00', '2025-12-31T00:00:00')]);
  });

  it('lets an open span absorb every later-starting row', () => {
    expect(unionSpans([
      span('2025-03-01T00:00:00', '2025-04-01T00:00:00'),
      span('2025-01-01T00:00:00', null),
      span('2026-06-01T00:00:00', '2026-07-01T00:00:00'),
    ])).toEqual([span('2025-01-01T00:00:00', null)]);
  });

  it('opens an ended span that an overlapping open row extends', () => {
    expect(unionSpans([
      span('2025-06-01T00:00:00', '2025-12-31T00:00:00'),
      span('2025-09-01T00:00:00', null),
    ])).toEqual([span('2025-06-01T00:00:00', null)]);
  });

  it('gives one open span for two open rows', () => {
    expect(unionSpans([
      span('2025-05-01T00:00:00', null),
      span('2025-02-01T00:00:00', null),
    ])).toEqual([span('2025-02-01T00:00:00', null)]);
  });

  it('keeps disjoint spans with a gap apart', () => {
    expect(unionSpans([
      span('2026-01-10T00:00:00', null),
      span('2025-09-05T00:00:00', '2025-12-01T00:00:00'),
    ])).toEqual([
      span('2025-09-05T00:00:00', '2025-12-01T00:00:00'),
      span('2026-01-10T00:00:00', null),
    ]);
  });

  it('merges spans that touch at the same instant', () => {
    expect(unionSpans([
      span('2025-01-01T00:00:00', '2025-06-01T00:00:00'),
      span('2025-06-01T00:00:00', '2025-09-01T00:00:00'),
    ])).toEqual([span('2025-01-01T00:00:00', '2025-09-01T00:00:00')]);
  });

  it('keeps day-adjacent spans apart', () => {
    expect(unionSpans([
      span('2025-01-01T00:00:00', '2025-12-31T00:00:00'),
      span('2026-01-01T00:00:00', null),
    ])).toEqual([
      span('2025-01-01T00:00:00', '2025-12-31T00:00:00'),
      span('2026-01-01T00:00:00', null),
    ]);
  });

  it('collapses exact duplicates', () => {
    const s = span('2025-01-01T00:00:00', '2025-03-01T00:00:00');
    expect(unionSpans([s, { ...s }, { ...s }])).toEqual([s]);
  });

  it('passes an inverted row through as its own span without extending a previous one', () => {
    expect(unionSpans([
      span('2025-01-01T00:00:00', '2025-02-01T00:00:00'),
      span('2025-03-01T00:00:00', '2025-02-15T00:00:00'), // end before start
      span('2025-04-01T00:00:00', null),
    ])).toEqual([
      span('2025-01-01T00:00:00', '2025-02-01T00:00:00'),
      span('2025-03-01T00:00:00', '2025-02-15T00:00:00'),
      span('2025-04-01T00:00:00', null),
    ]);
  });

  it('breaks equal starts the same way whatever the input order', () => {
    const rows = [
      span('2025-01-01T00:00:00', '2025-02-01T00:00:00'),
      span('2025-01-01T00:00:00', null),
      span('2025-01-01T00:00:00', '2025-05-01T00:00:00'),
    ];
    for (const order of permutations(rows)) {
      expect(unionSpans(order)).toEqual([span('2025-01-01T00:00:00', null)]);
    }
  });

  it('orders fractional-seconds values by code unit without parsing them', () => {
    expect(unionSpans([
      span('2025-01-05T00:00:00.123', '2025-02-01T00:00:00'),
      span('2025-01-01T00:00:00', '2025-01-05T00:00:00'),
    ])).toEqual([
      span('2025-01-01T00:00:00', '2025-01-05T00:00:00'),
      span('2025-01-05T00:00:00.123', '2025-02-01T00:00:00'),
    ]);
  });

  it('mutates neither the input array nor its objects', () => {
    const input = [
      span('2025-11-01T00:00:00', '2026-02-01T00:00:00'),
      span('2025-10-15T00:00:00', '2026-01-01T00:00:00'),
    ];
    const snapshot = structuredClone(input);
    const out = unionSpans(input);
    expect(input).toEqual(snapshot);
    out[0].endDate = 'changed';
    expect(input).toEqual(snapshot);
  });

  it('gives identical output for all 24 orders of ended, open and overlapping spans', () => {
    const rows = [
      span('2024-01-01T00:00:00', '2024-03-01T00:00:00'), // ended early
      span('2026-01-10T00:00:00', null), // open, later
      span('2025-10-15T00:00:00', '2026-01-01T00:00:00'), // overlapping ended pair
      span('2025-11-01T00:00:00', '2026-02-01T00:00:00'),
    ];
    const expected = [
      span('2024-01-01T00:00:00', '2024-03-01T00:00:00'),
      span('2025-10-15T00:00:00', null),
    ];
    const orders = permutations(rows);
    expect(orders).toHaveLength(24);
    for (const order of orders) expect(unionSpans(order)).toEqual(expected);
  });
});

describe('mergeSpansByKey', () => {
  it('returns [] for no rows', () => {
    expect(mergeSpansByKey([])).toEqual([]);
  });

  it('unions per key, keeps the first row meta, and orders by key then start', () => {
    const rows = [
      { key: '999-1', meta: { contactId: 999, name: 'first' }, startDate: '2026-01-10T00:00:00', endDate: null },
      { key: '1000-1', meta: { contactId: 1000 }, startDate: '2025-01-01T00:00:00', endDate: null },
      { key: '999-1', meta: { contactId: 999, name: 'second' }, startDate: '2025-09-05T00:00:00', endDate: '2025-12-01T00:00:00' },
      { key: '999-1', meta: { contactId: 999, name: 'third' }, startDate: '2025-10-01T00:00:00', endDate: '2025-11-01T00:00:00' },
    ];
    expect(mergeSpansByKey<{ contactId: number; name?: string }>(rows)).toEqual([
      // '1000-1' sorts before '999-1' by code unit: deterministic, not numeric
      { contactId: 1000, startDate: '2025-01-01T00:00:00', endDate: null },
      { contactId: 999, name: 'first', startDate: '2025-09-05T00:00:00', endDate: '2025-12-01T00:00:00' },
      { contactId: 999, name: 'first', startDate: '2026-01-10T00:00:00', endDate: null },
    ]);
  });

  it('gives the same array for every order of the same rows', () => {
    const rows = [
      { key: '1-1', meta: { contactId: 1 }, startDate: '2026-01-10T00:00:00', endDate: null },
      { key: '1-1', meta: { contactId: 1 }, startDate: '2025-09-05T00:00:00', endDate: '2025-12-01T00:00:00' },
      { key: '2-1', meta: { contactId: 2 }, startDate: '2025-09-01T00:00:00', endDate: null },
      { key: '1-3', meta: { contactId: 1 }, startDate: '2025-02-01T00:00:00', endDate: '2025-03-01T00:00:00' },
    ];
    const first = mergeSpansByKey(rows);
    for (const order of permutations(rows)) expect(mergeSpansByKey(order)).toEqual(first);
    expect(first).toHaveLength(4);
  });
});
