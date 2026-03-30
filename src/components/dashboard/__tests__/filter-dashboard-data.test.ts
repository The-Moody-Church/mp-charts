import { describe, it, expect } from 'vitest';
import { computePeriodMetrics } from '../filter-dashboard-data';
import type { MonthlyAttendanceTrend } from '@/lib/dto';

describe('computePeriodMetrics', () => {
  const start = new Date(2026, 1, 1); // Feb 1
  const end = new Date(2026, 1, 28);  // Feb 28

  it('returns zeros for empty input', () => {
    const result = computePeriodMetrics([], start, end);
    expect(result.averageInPersonAttendance).toBe(0);
    expect(result.averageOnlineAttendance).toBe(0);
    expect(result.averageAttendance).toBe(0);
    expect(result.totalEvents).toBe(0);
  });

  it('computes weighted average from monthly data', () => {
    const monthly: MonthlyAttendanceTrend[] = [
      { month: '2026-01', monthName: 'January', averageInPersonAttendance: 500, averageOnlineAttendance: 100, averageTotalAttendance: 600, eventCount: 4, inPersonEventCount: 4, onlineEventCount: 4 },
      { month: '2026-02', monthName: 'February', averageInPersonAttendance: 400, averageOnlineAttendance: 80, averageTotalAttendance: 480, eventCount: 4, inPersonEventCount: 4, onlineEventCount: 4 },
    ];
    const result = computePeriodMetrics(monthly, start, end);

    // Weighted avg: (500*4 + 400*4) / 8 = 3600/8 = 450
    expect(result.averageInPersonAttendance).toBe(450);
    // (100*4 + 80*4) / 8 = 720/8 = 90
    expect(result.averageOnlineAttendance).toBe(90);
    expect(result.totalEvents).toBe(8);
  });

  it('computes correct average from weekly-converted data (per-event averages)', () => {
    // Simulates weekly data after the fix: inPersonAttendance/eventCount
    // Date with 1 event: 500 in-person, Date with 2 events: 250 avg per event
    const weeklyConverted: MonthlyAttendanceTrend[] = [
      { month: '2026-02-01', monthName: 'Feb 1', averageInPersonAttendance: 500, averageOnlineAttendance: 100, averageTotalAttendance: 600, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
      { month: '2026-02-08', monthName: 'Feb 8', averageInPersonAttendance: 250, averageOnlineAttendance: 50, averageTotalAttendance: 300, eventCount: 2, inPersonEventCount: 2, onlineEventCount: 2 },
      { month: '2026-02-15', monthName: 'Feb 15', averageInPersonAttendance: 480, averageOnlineAttendance: 90, averageTotalAttendance: 570, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
      { month: '2026-02-22', monthName: 'Feb 22', averageInPersonAttendance: 510, averageOnlineAttendance: 110, averageTotalAttendance: 620, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
    ];
    const result = computePeriodMetrics(weeklyConverted, start, end);

    // totalEvents = 1 + 2 + 1 + 1 = 5
    expect(result.totalEvents).toBe(5);

    // Weighted: (500*1 + 250*2 + 480*1 + 510*1) / 5 = (500+500+480+510)/5 = 1990/5 = 398
    expect(result.averageInPersonAttendance).toBe(398);

    // All values should be non-zero
    expect(result.averageInPersonAttendance).toBeGreaterThan(0);
    expect(result.averageOnlineAttendance).toBeGreaterThan(0);
  });

  it('produces non-zero attendance for typical single-month weekly data', () => {
    // Typical Sunday worship: 1 event per date, ~500 attendance
    const weeklyConverted: MonthlyAttendanceTrend[] = [
      { month: '2026-02-01', monthName: 'Feb 1', averageInPersonAttendance: 500, averageOnlineAttendance: 100, averageTotalAttendance: 600, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
      { month: '2026-02-08', monthName: 'Feb 8', averageInPersonAttendance: 480, averageOnlineAttendance: 95, averageTotalAttendance: 575, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
      { month: '2026-02-15', monthName: 'Feb 15', averageInPersonAttendance: 510, averageOnlineAttendance: 105, averageTotalAttendance: 615, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
      { month: '2026-02-22', monthName: 'Feb 22', averageInPersonAttendance: 490, averageOnlineAttendance: 98, averageTotalAttendance: 588, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
    ];
    const result = computePeriodMetrics(weeklyConverted, start, end);

    expect(result.averageInPersonAttendance).toBeGreaterThan(0);
    expect(result.averageOnlineAttendance).toBeGreaterThan(0);
    // The sum should be suitable for the Venn diagram attendance circle
    const totalAttendance = result.averageInPersonAttendance + result.averageOnlineAttendance;
    expect(totalAttendance).toBeGreaterThan(0);
  });

  it('excludes missing data from averages (in-person present but online missing)', () => {
    // Scenario: 3/15 has in-person data but no online data.
    // Online average should only count weeks that actually have online data,
    // not include 3/15 as a 0.
    const weeklyConverted: MonthlyAttendanceTrend[] = [
      { month: '2026-03-01', monthName: 'Mar 1', averageInPersonAttendance: 1100, averageOnlineAttendance: 900, averageTotalAttendance: 2000, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
      { month: '2026-03-08', monthName: 'Mar 8', averageInPersonAttendance: 1050, averageOnlineAttendance: 850, averageTotalAttendance: 1900, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
      // 3/15: in-person data exists but NO online data
      { month: '2026-03-15', monthName: 'Mar 15', averageInPersonAttendance: 1080, averageOnlineAttendance: 0, averageTotalAttendance: 1080, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 0 },
      { month: '2026-03-22', monthName: 'Mar 22', averageInPersonAttendance: 1120, averageOnlineAttendance: 920, averageTotalAttendance: 2040, eventCount: 1, inPersonEventCount: 1, onlineEventCount: 1 },
    ];
    const marchStart = new Date(2026, 2, 1);
    const marchEnd = new Date(2026, 2, 31);
    const result = computePeriodMetrics(weeklyConverted, marchStart, marchEnd);

    // In-person: all 4 weeks have data → (1100+1050+1080+1120) / 4 = 4350/4 = 1088
    expect(result.averageInPersonAttendance).toBe(1088);

    // Online: only 3 weeks have data → (900+850+920) / 3 = 2670/3 = 890
    // NOT (900+850+0+920) / 4 = 668 (the old buggy behavior)
    expect(result.averageOnlineAttendance).toBe(890);

    expect(result.totalEvents).toBe(4);
  });

  it('handles backward compat when inPersonEventCount/onlineEventCount are missing', () => {
    // Old data without the new fields should still work (falls back to eventCount)
    const monthly: MonthlyAttendanceTrend[] = [
      { month: '2026-01', monthName: 'January', averageInPersonAttendance: 500, averageOnlineAttendance: 100, averageTotalAttendance: 600, eventCount: 4 },
    ];
    const result = computePeriodMetrics(monthly, start, end);

    expect(result.averageInPersonAttendance).toBe(500);
    expect(result.averageOnlineAttendance).toBe(100);
    expect(result.totalEvents).toBe(4);
  });
});
