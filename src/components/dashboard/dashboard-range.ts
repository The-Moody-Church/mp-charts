/**
 * The dashboard's stable full-range cache parameters, shared by the server
 * actions (actions.ts) and cache warming (src/lib/cache-warming.ts) so both
 * build the same 'use cache' and serviceCache keys.
 *
 * The range is the last five ministry years (Sep 1 .. Aug 31). The end is the
 * END of the current ministry year, not today, so the keys change only once a
 * year, at the September rollover (.claude/rules/caching.md, "Cache keys must be
 * stable"). Aug 31 is an inclusive calendar day: the service queries
 * `< Sep 1 00:00` Central (mp-date-range.ts) and caps month iteration at the
 * current Central month itself.
 *
 * The ministry year is read with server-local getters: production runs in a UTC
 * container, so there the rollover happens at local (UTC) midnight.
 */
export interface DashboardRange {
  /** Current ministry year (the calendar year its September falls in). */
  currentYear: number;
  /** First ministry year of the five-year range (currentYear - 4). */
  earliestYear: number;
  /** 'YYYY-08-31' at the end of the current ministry year. */
  endDateIso: string;
  /** 'YYYY-09-01' at the start of the earliest ministry year. */
  fullRangeStartIso: string;
  /** Same as endDateIso. */
  fullRangeEndIso: string;
}

export function getDashboardRange(now: Date = new Date()): DashboardRange {
  const currentYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  const earliestYear = currentYear - 4;
  const endDateIso = `${currentYear + 1}-08-31`;
  return {
    currentYear,
    earliestYear,
    endDateIso,
    fullRangeStartIso: `${earliestYear}-09-01`,
    fullRangeEndIso: endDateIso,
  };
}
