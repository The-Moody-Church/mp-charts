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
 * The ministry year is read on the MP (US Central) calendar, whatever the
 * server's zone: the rollover, and with it every dashboard cache key, happens at
 * midnight Central on Sep 1. (Server-local getters rolled over at 00:00 UTC in
 * the production container, which is 19:00 CDT on Aug 31.) The browser's
 * default selection (date-range-filter.tsx) keeps the viewer's own calendar.
 */
import { mpMonthKey } from '@/lib/providers/ministry-platform/utils/mp-date-range';

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
  const [year, month] = mpMonthKey(now).split('-').map(Number);
  const currentYear = month >= 9 ? year : year - 1;
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
