import { describe, it, expect, afterEach } from 'vitest';
import { getDashboardRange } from '@/components/dashboard/dashboard-range';

// Node re-reads process.env.TZ on assignment, so a test can pin the server's
// local zone. Restored in afterEach; `delete` restores the system default.
const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('getDashboardRange', () => {
  it('covers the last five ministry years, ending on Aug 31 of the current one', () => {
    expect(getDashboardRange(new Date('2026-11-17T18:00:00Z'))).toEqual({
      currentYear: 2026,
      earliestYear: 2022,
      endDateIso: '2027-08-31',
      fullRangeStartIso: '2022-09-01',
      fullRangeEndIso: '2027-08-31',
    });
  });

  it('is identical every day of a ministry year (stable cache keys)', () => {
    // Sep 1 00:00 CDT, Feb 28 noon CST, Aug 31 23:59:59 CDT.
    const first = getDashboardRange(new Date('2026-09-01T05:00:00Z'));
    expect(getDashboardRange(new Date('2027-02-28T18:00:00Z'))).toEqual(first);
    expect(getDashboardRange(new Date('2027-09-01T04:59:59Z'))).toEqual(first);
  });

  it('uses the previous calendar year before September, and rolls over on Sep 1', () => {
    expect(getDashboardRange(new Date('2026-09-01T04:59:59Z')).currentYear).toBe(2025);
    expect(getDashboardRange(new Date('2026-09-01T05:00:00Z')).currentYear).toBe(2026);
  });

  // The ministry year follows the MP (US Central) calendar whatever the server's
  // zone. Production runs in Docker with TZ unset (UTC); before this it rolled
  // over, with every dashboard cache key, at Aug 31 19:00 CDT.
  for (const tz of ['UTC', 'America/Chicago', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles']) {
    it(`rolls over at midnight Central on Sep 1 (process TZ ${tz})`, () => {
      process.env.TZ = tz;
      // Aug 31 19:00 CDT: already Sep 1 in UTC, still August in Central.
      expect(getDashboardRange(new Date('2026-09-01T00:00:00Z')).currentYear).toBe(2025);
      // Aug 31 23:59:59 CDT.
      expect(getDashboardRange(new Date('2026-09-01T04:59:59Z')).currentYear).toBe(2025);
      // Sep 1 00:00 CDT.
      expect(getDashboardRange(new Date('2026-09-01T05:00:00Z')).currentYear).toBe(2026);
      // Aug 31 20:00 UTC is Sep 1 in Tokyo, but Aug 31 15:00 in Central.
      expect(getDashboardRange(new Date('2026-08-31T20:00:00Z')).currentYear).toBe(2025);
    });
  }

  it('reads Central in winter too (CST, UTC-6): Jan 1 rollover does not change the year', () => {
    process.env.TZ = 'UTC';
    // Dec 31 19:00 CST is already Jan 1 in UTC; both are in the same ministry year.
    expect(getDashboardRange(new Date('2027-01-01T01:00:00Z')).currentYear).toBe(2026);
    expect(getDashboardRange(new Date('2027-01-01T06:00:00Z')).currentYear).toBe(2026);
  });
});
