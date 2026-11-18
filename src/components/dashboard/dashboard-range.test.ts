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
    expect(getDashboardRange(new Date(2026, 10, 17, 12))).toEqual({
      currentYear: 2026,
      earliestYear: 2022,
      endDateIso: '2027-08-31',
      fullRangeStartIso: '2022-09-01',
      fullRangeEndIso: '2027-08-31',
    });
  });

  it('is identical every day of a ministry year (stable cache keys)', () => {
    const first = getDashboardRange(new Date(2026, 8, 1, 0, 0, 0));
    expect(getDashboardRange(new Date(2027, 1, 28, 12))).toEqual(first);
    expect(getDashboardRange(new Date(2027, 7, 31, 23, 59, 59))).toEqual(first);
  });

  it('uses the previous calendar year before September, and rolls over on Sep 1', () => {
    expect(getDashboardRange(new Date(2026, 7, 31, 23, 59, 59)).currentYear).toBe(2025);
    expect(getDashboardRange(new Date(2026, 8, 1, 0, 0, 0)).currentYear).toBe(2026);
  });

  // The ministry year follows the SERVER's local calendar, not UTC and not Central.
  // Production runs in Docker with TZ unset (UTC), so there the rollover, and with
  // it every dashboard cache key, happens at Aug 31 19:00 CDT.
  it('reads server-local time: still August in Chicago when UTC is already September', () => {
    process.env.TZ = 'America/Chicago';
    expect(getDashboardRange(new Date('2026-09-01T03:00:00Z')).currentYear).toBe(2025);
  });

  it('reads server-local time: already September in Tokyo when UTC is still August', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(getDashboardRange(new Date('2026-08-31T20:00:00Z')).currentYear).toBe(2026);
  });

  it('rolls over at local midnight under UTC (the production container zone)', () => {
    process.env.TZ = 'UTC';
    expect(getDashboardRange(new Date('2026-08-31T23:59:59Z')).currentYear).toBe(2025);
    expect(getDashboardRange(new Date('2026-09-01T00:00:00Z')).currentYear).toBe(2026);
  });
});
