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
      { month: '2026-01', monthName: 'January', averageInPersonAttendance: 500, averageOnlineAttendance: 100, averageTotalAttendance: 600, eventCount: 4 },
      { month: '2026-02', monthName: 'February', averageInPersonAttendance: 400, averageOnlineAttendance: 80, averageTotalAttendance: 480, eventCount: 4 },
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
      { month: '2026-02-01', monthName: 'Feb 1', averageInPersonAttendance: 500, averageOnlineAttendance: 100, averageTotalAttendance: 600, eventCount: 1 },
      { month: '2026-02-08', monthName: 'Feb 8', averageInPersonAttendance: 250, averageOnlineAttendance: 50, averageTotalAttendance: 300, eventCount: 2 },
      { month: '2026-02-15', monthName: 'Feb 15', averageInPersonAttendance: 480, averageOnlineAttendance: 90, averageTotalAttendance: 570, eventCount: 1 },
      { month: '2026-02-22', monthName: 'Feb 22', averageInPersonAttendance: 510, averageOnlineAttendance: 110, averageTotalAttendance: 620, eventCount: 1 },
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
      { month: '2026-02-01', monthName: 'Feb 1', averageInPersonAttendance: 500, averageOnlineAttendance: 100, averageTotalAttendance: 600, eventCount: 1 },
      { month: '2026-02-08', monthName: 'Feb 8', averageInPersonAttendance: 480, averageOnlineAttendance: 95, averageTotalAttendance: 575, eventCount: 1 },
      { month: '2026-02-15', monthName: 'Feb 15', averageInPersonAttendance: 510, averageOnlineAttendance: 105, averageTotalAttendance: 615, eventCount: 1 },
      { month: '2026-02-22', monthName: 'Feb 22', averageInPersonAttendance: 490, averageOnlineAttendance: 98, averageTotalAttendance: 588, eventCount: 1 },
    ];
    const result = computePeriodMetrics(weeklyConverted, start, end);

    expect(result.averageInPersonAttendance).toBeGreaterThan(0);
    expect(result.averageOnlineAttendance).toBeGreaterThan(0);
    // The sum should be suitable for the Venn diagram attendance circle
    const totalAttendance = result.averageInPersonAttendance + result.averageOnlineAttendance;
    expect(totalAttendance).toBeGreaterThan(0);
  });
});
