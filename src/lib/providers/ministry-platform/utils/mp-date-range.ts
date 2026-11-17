/**
 * Calendar-day date ranges for Ministry Platform `$filter` clauses.
 *
 * Callers hand services a range as two `Date`s built with the local constructor
 * (`new Date(2025, 8, 1)` .. `new Date(2026, 7, 31)`), meaning "Sep 1 through Aug 31,
 * inclusive". These helpers turn that into **half-open MP wall-clock bounds**:
 *
 *   col >= '<startDay> 00:00:00' AND col < '<dayAfter(endDay)> 00:00:00'
 *
 * so every moment of the last day is included, whatever time the row carries.
 *
 * Rules:
 * - A caller `Date` names a calendar day, read with process-local getters (the frame the
 *   caller built it in). Never pass one to `toMpSqlDatetime(Date)`: that treats it as an
 *   instant and, under TZ=UTC, turns midnight Sep 1 into '2025-08-31 19:00:00' Central.
 * - `toMpSqlDatetime` here only ever sees a 'YYYY-MM-DD' string, or a real instant
 *   (`new Date()` in `mpMonthKey`).
 * - The literal is 'YYYY-MM-DD 00:00:00' with no `Z`, so the filter is the same on a
 *   developer Mac in any zone as on the UTC production container.
 *
 * Pattern reference: `.claude/references/ministryplatform.datetimehandling.md`
 * ("Date ranges in $filter").
 */
import { toMpSqlDatetime } from './mp-datetime';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 'YYYY-MM-DD' named by a caller-built Date (`new Date(y, m, d)`), read with LOCAL getters.
 * Any time of day on the Date is ignored. Throws on an Invalid Date.
 */
export function calendarDay(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error('calendarDay: invalid Date');
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Calendar arithmetic on a 'YYYY-MM-DD' string (TZ-independent; handles month/year/leap rollover). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export interface MpDateRange {
  /** Inclusive lower bound, 'YYYY-MM-DD 00:00:00' (MP wall-clock). */
  start: string;
  /** Exclusive upper bound: midnight at the start of the day after the end day. */
  endExclusive: string;
  /** 'YYYY-MM-DD' of `start`. */
  startDay: string;
  /** 'YYYY-MM-DD' of `endExclusive`. */
  endExclusiveDay: string;
}

/** Inclusive [startDate..endDate] calendar days -> half-open MP wall-clock bounds. */
export function toMpDateRange(startDate: Date, endDate: Date): MpDateRange {
  const startDay = calendarDay(startDate);
  const endExclusiveDay = addDays(calendarDay(endDate), 1);
  return {
    start: toMpSqlDatetime(startDay),
    endExclusive: toMpSqlDatetime(endExclusiveDay),
    startDay,
    endExclusiveDay,
  };
}

export interface MonthWindow extends MpDateRange {
  /** 'YYYY-MM' */
  key: string;
  /** 0-11 */
  monthIndex: number;
}

/** 'YYYY-MM' of an INSTANT in MP time (US Central). */
export function mpMonthKey(now: Date = new Date()): string {
  return toMpSqlDatetime(now).slice(0, 7);
}

/**
 * Whole calendar months from the month containing `startDate` through the month containing
 * `endDate`, optionally capped at the current month in MP time. Steps integer (year, month)
 * pairs, so a start on the 29th-31st never skips a month.
 */
export function monthWindows(
  startDate: Date,
  endDate: Date,
  opts: { capAtMpToday?: boolean; now?: Date } = {},
): MonthWindow[] {
  const first = calendarDay(startDate).slice(0, 7);
  let last = calendarDay(endDate).slice(0, 7);
  if (opts.capAtMpToday) {
    const current = mpMonthKey(opts.now ?? new Date());
    if (current < last) last = current;
  }

  const windows: MonthWindow[] = [];
  let [y, m] = first.split('-').map(Number);
  for (let key = first; key <= last; key = `${y}-${pad(m)}`) {
    const startDay = `${key}-01`;
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const endExclusiveDay = `${nextY}-${pad(nextM)}-01`;
    windows.push({
      key,
      monthIndex: m - 1,
      startDay,
      endExclusiveDay,
      start: toMpSqlDatetime(startDay),
      endExclusive: toMpSqlDatetime(endExclusiveDay),
    });
    y = nextY;
    m = nextM;
  }
  return windows;
}
