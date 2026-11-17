import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  addDays,
  calendarDay,
  monthWindows,
  mpMonthKey,
  toMpDateRange,
} from '@/lib/providers/ministry-platform/utils/mp-date-range';

// Node re-reads TZ on assignment. Every Date below is built inside an `it`, after
// the describe's beforeAll has set the zone, so it is a local Date in that zone,
// exactly as the dashboard callers build theirs.
const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe.each(['UTC', 'America/Chicago', 'Asia/Tokyo'])('mp-date-range under TZ=%s', (tz) => {
  beforeAll(() => {
    process.env.TZ = tz;
  });

  describe('calendarDay', () => {
    it('names the local calendar day, ignoring the time', () => {
      expect(calendarDay(new Date(2025, 8, 1))).toBe('2025-09-01');
      expect(calendarDay(new Date(2026, 7, 31, 23, 59, 59))).toBe('2026-08-31');
    });

    it('throws on an Invalid Date, so nothing is queried or cached', () => {
      expect(() => calendarDay(new Date('nope'))).toThrow('calendarDay: invalid Date');
    });
  });

  describe('toMpDateRange', () => {
    it('turns the ministry year Sep 1..Aug 31 into a half-open range ending at Sep 1 midnight', () => {
      expect(toMpDateRange(new Date(2025, 8, 1), new Date(2026, 7, 31))).toEqual({
        start: '2025-09-01 00:00:00',
        endExclusive: '2026-09-01 00:00:00',
        startDay: '2025-09-01',
        endExclusiveDay: '2026-09-01',
      });
    });

    it('still ends at the next midnight when the end Date carries a time', () => {
      expect(toMpDateRange(new Date(2025, 8, 1), new Date(2026, 7, 31, 23, 59, 59)).endExclusive)
        .toBe('2026-09-01 00:00:00');
    });

    it('rolls Dec 31 over to Jan 1 of the next year', () => {
      expect(toMpDateRange(new Date(2025, 11, 1), new Date(2025, 11, 31)).endExclusive)
        .toBe('2026-01-01 00:00:00');
    });

    it('handles February in common and leap years', () => {
      expect(toMpDateRange(new Date(2026, 1, 1), new Date(2026, 1, 28)).endExclusive)
        .toBe('2026-03-01 00:00:00');
      expect(toMpDateRange(new Date(2028, 1, 1), new Date(2028, 1, 28)).endExclusive)
        .toBe('2028-02-29 00:00:00');
      expect(toMpDateRange(new Date(2028, 1, 1), new Date(2028, 1, 29)).endExclusive)
        .toBe('2028-03-01 00:00:00');
    });

    it('throws on an Invalid Date at either end', () => {
      expect(() => toMpDateRange(new Date('x'), new Date(2026, 7, 31))).toThrow();
      expect(() => toMpDateRange(new Date(2025, 8, 1), new Date('x'))).toThrow();
    });
  });

  describe('monthWindows', () => {
    it('yields whole calendar months for the ministry year', () => {
      const w = monthWindows(new Date(2025, 8, 1), new Date(2026, 7, 31));
      expect(w).toHaveLength(12);
      expect(w[0]).toEqual({
        key: '2025-09',
        monthIndex: 8,
        start: '2025-09-01 00:00:00',
        endExclusive: '2025-10-01 00:00:00',
        startDay: '2025-09-01',
        endExclusiveDay: '2025-10-01',
      });
      expect(w[11]).toMatchObject({ key: '2026-08', monthIndex: 7, endExclusive: '2026-09-01 00:00:00' });
    });

    it('moves a start on the 31st to the 1st and never skips a month', () => {
      const w = monthWindows(new Date(2025, 0, 31), new Date(2025, 3, 30));
      expect(w.map((m) => m.key)).toEqual(['2025-01', '2025-02', '2025-03', '2025-04']);
      expect(w.map((m) => m.monthIndex)).toEqual([0, 1, 2, 3]);
      expect(w[1]).toMatchObject({ start: '2025-02-01 00:00:00', endExclusive: '2025-03-01 00:00:00' });
    });

    it('crosses the year boundary', () => {
      const w = monthWindows(new Date(2025, 10, 1), new Date(2026, 1, 28));
      expect(w.map((m) => m.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
      expect(w[1]).toMatchObject({ startDay: '2025-12-01', endExclusiveDay: '2026-01-01' });
    });

    it('returns [] when the start month is after the end month', () => {
      expect(monthWindows(new Date(2026, 2, 1), new Date(2026, 0, 31))).toEqual([]);
    });

    it('caps at the current month in Central time when asked', () => {
      // 03:00 UTC Dec 1 is 21:00 Nov 30 in Chicago: December has not begun in MP time.
      const now = new Date('2025-12-01T03:00:00Z');
      const w = monthWindows(new Date(2025, 8, 1), new Date(2026, 7, 31), { capAtMpToday: true, now });
      expect(w.map((m) => m.key)).toEqual(['2025-09', '2025-10', '2025-11']);
    });

    it('returns [] when the whole range is after the current MP month', () => {
      const now = new Date('2025-11-15T18:00:00Z');
      expect(monthWindows(new Date(2026, 0, 1), new Date(2026, 11, 31), { capAtMpToday: true, now })).toEqual([]);
    });

    it('does not cap when the range is already over', () => {
      const now = new Date('2027-01-01T18:00:00Z');
      expect(monthWindows(new Date(2025, 8, 1), new Date(2026, 7, 31), { capAtMpToday: true, now })).toHaveLength(12);
    });
  });
});

describe('never treats a caller Date as an instant', () => {
  beforeAll(() => {
    process.env.TZ = 'UTC';
  });

  it('keeps Sep 1 midnight as Sep 1, not Aug 31 19:00 Central', () => {
    // Passing the Date to toMpSqlDatetime would convert this UTC midnight to
    // Central and land on the previous day. The range must not do that.
    const r = toMpDateRange(new Date(2025, 8, 1), new Date(2026, 7, 31));
    expect(r.start).toBe('2025-09-01 00:00:00');
    expect(r.start).not.toBe('2025-08-31 19:00:00');
  });
});

describe('addDays', () => {
  it('rolls over months, years and leap days', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('mpMonthKey', () => {
  it('reads the month in Central time', () => {
    expect(mpMonthKey(new Date('2025-12-01T03:00:00Z'))).toBe('2025-11');
    expect(mpMonthKey(new Date('2025-12-01T06:00:00Z'))).toBe('2025-12');
  });
});
