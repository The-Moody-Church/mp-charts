/**
 * Order-independent merge of Ministry Platform membership date spans.
 *
 * Pure helpers for dashboardService: no MP calls, no `next/*` imports, no
 * `'use cache'`. They replace a keep-the-earliest-start merge that depended on
 * the order MP returned rows in (MP gives no ORDER BY guarantee), lost the
 * later end of overlapping rows, and in one order filled the gap between an
 * ended row and a later active one.
 *
 * Dates are MP wall-clock strings and are compared by code unit, never parsed:
 * no timezone can enter, and a fractional-seconds value ("…:00.123") that
 * `parseMpDatetime` would reject still orders correctly. This relies on one MP
 * query returning one string shape ("YYYY-MM-DDTHH:MM:SS[.fff]"); mixing " "
 * and "T" separators would misorder.
 */

export interface DateSpan {
  startDate: string;
  endDate: string | null;
}

/** Code-unit order of two MP wall-clock strings of the same shape. */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** End-date order with null (still active) as +infinity. */
function cmpEnd(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return cmp(a, b);
}

/**
 * Union of date spans. The output depends only on the multiset of inputs, not
 * their order. Overlapping spans, contained spans and spans touching at the same
 * instant (end === next start) merge; a gap, even a one-day one, keeps two spans.
 * Returns disjoint copies in start order and never mutates the input.
 *
 * An inverted row (end before start) is passed through as its own span: no later
 * row can overlap it, because a later start is >= its start > its end.
 */
export function unionSpans(spans: readonly DateSpan[]): DateSpan[] {
  const sorted = [...spans].sort(
    (a, b) => cmp(a.startDate, b.startDate) || -cmpEnd(a.endDate, b.endDate)
  );

  const out: DateSpan[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && (last.endDate === null || cmp(s.startDate, last.endDate) <= 0)) {
      if (last.endDate !== null && cmpEnd(s.endDate, last.endDate) > 0) {
        last.endDate = s.endDate;
      }
    } else {
      out.push({ startDate: s.startDate, endDate: s.endDate });
    }
  }
  return out;
}

/**
 * Group rows by key, union each key's spans, and emit `{ ...meta, startDate,
 * endDate }` once per disjoint span. `meta` comes from the first row seen for a
 * key, so it must be a pure function of the key (it is at every call site).
 *
 * Output order: keys in code-unit order (locale-independent; "1000-1" sorts
 * before "999-1"), then span start. The same data therefore gives the same
 * array, whatever order MP returned the rows in.
 */
export function mergeSpansByKey<M extends object>(
  rows: Iterable<{ key: string; meta: M; startDate: string; endDate: string | null }>
): Array<M & DateSpan> {
  const byKey = new Map<string, { meta: M; spans: DateSpan[] }>();
  for (const row of rows) {
    let entry = byKey.get(row.key);
    if (!entry) {
      entry = { meta: row.meta, spans: [] };
      byKey.set(row.key, entry);
    }
    entry.spans.push({ startDate: row.startDate, endDate: row.endDate });
  }

  const out: Array<M & DateSpan> = [];
  for (const key of [...byKey.keys()].sort(cmp)) {
    const { meta, spans } = byKey.get(key)!;
    for (const span of unionSpans(spans)) {
      out.push({ ...meta, startDate: span.startDate, endDate: span.endDate });
    }
  }
  return out;
}
