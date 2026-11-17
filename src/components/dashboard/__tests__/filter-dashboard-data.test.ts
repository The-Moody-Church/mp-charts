import { describe, it, expect } from 'vitest';
import {
  computePeriodMetrics,
  computeRosterVsAttendance,
  computeServingMetrics,
  computeEngagementOverlap,
  countDatesInRange,
} from '../filter-dashboard-data';
import type {
  MonthlyAttendanceTrend,
  RosterMemberRecord,
  ServingLeadingRecord,
  EngagementRawData,
} from '@/lib/dto';

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

// The server keeps one record per disjoint membership span, so a contact who
// left and came back appears twice. These pin that every consumer counts
// distinct contacts, and that a period inside the gap does not count them.
describe('multi-span records (one contact, two disjoint spans)', () => {
  const fullStart = new Date(2025, 8, 1); // Sep 1 2025
  const fullEnd = new Date(2026, 2, 31); // Mar 31 2026
  const gapStart = new Date(2025, 10, 1); // Nov 1 2025
  const gapEnd = new Date(2025, 11, 31); // Dec 31 2025

  it('computeServingMetrics counts the contact once, and not in the gap months', () => {
    const base = {
      contactId: 7, roleTypeId: 3, roleTypeName: 'Servant', ministryId: 60, ministryName: 'Children',
    };
    const records: ServingLeadingRecord[] = [
      { ...base, startDate: '2025-09-05T00:00:00', endDate: '2025-10-15T00:00:00' },
      { ...base, startDate: '2026-01-10T00:00:00', endDate: null },
    ];

    const result = computeServingMetrics(records, fullStart, fullEnd);
    expect(result.totalServingLeading).toBe(1);
    expect(result.servingByRoleType).toEqual([{ roleTypeId: 3, roleTypeName: 'Servant', uniqueContacts: 1 }]);
    expect(result.servingByMinistry).toEqual([{ ministryId: 60, ministryName: 'Children', uniqueContacts: 1 }]);
    expect(result.servingTrends.map((t) => [t.month, t.totalCount])).toEqual([
      ['2025-09', 1], ['2025-10', 1], ['2025-11', 0], ['2025-12', 0],
      ['2026-01', 1], ['2026-02', 1], ['2026-03', 1],
    ]);

    expect(computeServingMetrics(records, gapStart, gapEnd).totalServingLeading).toBe(0);
  });

  it('computeRosterVsAttendance counts the contact once, and not in a period inside the gap', () => {
    const base = { contactId: 7, groupTypeId: 1, groupTypeName: 'Small Group' };
    const records: RosterMemberRecord[] = [
      { ...base, startDate: '2025-09-05T00:00:00', endDate: '2025-10-15T00:00:00' },
      { ...base, startDate: '2026-01-10T00:00:00', endDate: null },
    ];

    expect(computeRosterVsAttendance(records, [], fullStart, fullEnd)).toEqual([
      { groupTypeName: 'Small Group', rosterCount: 1, attendanceCount: 0 },
    ]);
    expect(computeRosterVsAttendance(records, [], gapStart, gapEnd)).toEqual([]);
  });

  it('computeEngagementOverlap counts the contact once in the group circle', () => {
    const rawData: EngagementRawData = {
      activityByMonth: [],
      groupRecords: [
        { contactId: 7, startDate: '2025-09-05T00:00:00', endDate: '2025-10-15T00:00:00' },
        { contactId: 7, startDate: '2026-01-10T00:00:00', endDate: null },
      ],
      adultContactIds: [7],
    };

    const result = computeEngagementOverlap(rawData, [], fullStart, fullEnd);
    expect(result.totalGroup).toBe(1);
    expect(result.groupOnly).toBe(1);
    expect(computeEngagementOverlap(rawData, [], gapStart, gapEnd).totalGroup).toBe(0);
  });
});

// #305, client side: the selection's endDate is midnight at the START of the last day,
// and MP values carry a time of day. Every consumer must count the whole last day, and
// nothing from the day after it. Real MP rows look like these (Group_Participants
// Start_Date '2025-08-31T11:30:00', Participant_Milestones '2026-02-22T10:15:00').
describe('last day of the selected range (#305)', () => {
  const augStart = new Date(2025, 7, 1); // Aug 1 2025
  const augEnd = new Date(2025, 7, 31); // Aug 31 2025 (inclusive)
  const serving = (startDate: string, endDate: string | null, contactId = 1): ServingLeadingRecord => ({
    contactId, roleTypeId: 3, roleTypeName: 'Servant', ministryId: 60, ministryName: 'Children', startDate, endDate,
  });

  it('countDatesInRange counts a milestone later in the day on the last day, in that month only', () => {
    const dates = ['2026-05-31T10:15:00', '2026-06-01T00:00:00', '2026-04-30T23:59:59'];
    expect(countDatesInRange(dates, new Date(2026, 4, 1), new Date(2026, 4, 31))).toBe(1);
    expect(countDatesInRange(dates, new Date(2026, 5, 1), new Date(2026, 5, 30))).toBe(1);
    expect(countDatesInRange(dates, new Date(2026, 3, 1), new Date(2026, 3, 30))).toBe(1);
  });

  it('countDatesInRange accepts a space separator and a fractional-second value', () => {
    expect(countDatesInRange(['2026-05-31 19:30:00', '2026-05-01T00:00:00.123'], new Date(2026, 4, 1), new Date(2026, 4, 31))).toBe(2);
  });

  it('computeServingMetrics counts a span that starts at 10:29 on the last day, in the total and the trend', () => {
    const result = computeServingMetrics([serving('2025-08-31T10:29:00', null)], augStart, augEnd);
    expect(result.totalServingLeading).toBe(1);
    expect(result.servingByRoleType).toEqual([{ roleTypeId: 3, roleTypeName: 'Servant', uniqueContacts: 1 }]);
    expect(result.servingTrends).toEqual([
      expect.objectContaining({ month: '2025-08', servingCount: 1, totalCount: 1 }),
    ]);
  });

  it('computeServingMetrics puts a last-day start in that month, not the month before, in a multi-month trend', () => {
    const result = computeServingMetrics([serving('2025-11-30T10:00:00', null)], new Date(2025, 9, 1), new Date(2025, 11, 31));
    expect(result.servingTrends.map((t) => [t.month, t.totalCount])).toEqual([
      ['2025-10', 0], ['2025-11', 1], ['2025-12', 1],
    ]);
  });

  it('computeServingMetrics leaves out a span that starts on the day after the range', () => {
    const result = computeServingMetrics([serving('2025-09-01T00:00:00', null)], augStart, augEnd);
    expect(result.totalServingLeading).toBe(0);
    expect(result.servingTrends.map((t) => t.totalCount)).toEqual([0]);
  });

  it('computeServingMetrics counts a span that ended later in the day on the first day', () => {
    expect(computeServingMetrics([serving('2025-06-01T00:00:00', '2025-08-01T09:00:00')], augStart, augEnd).totalServingLeading).toBe(1);
    expect(computeServingMetrics([serving('2025-06-01T00:00:00', '2025-07-31T23:00:00')], augStart, augEnd).totalServingLeading).toBe(0);
  });

  it('computeRosterVsAttendance counts a roster span starting at 11:30 on the last day', () => {
    const records: RosterMemberRecord[] = [
      { contactId: 9, groupTypeId: 1, groupTypeName: 'Small Group', startDate: '2025-08-31T11:30:00', endDate: null },
      { contactId: 10, groupTypeId: 1, groupTypeName: 'Small Group', startDate: '2025-09-01T00:00:00', endDate: null },
    ];
    expect(computeRosterVsAttendance(records, [], augStart, augEnd)).toEqual([
      { groupTypeName: 'Small Group', rosterCount: 1, attendanceCount: 0 },
    ]);
  });

  it('computeEngagementOverlap counts group and serving spans starting on the last day', () => {
    const rawData: EngagementRawData = {
      activityByMonth: [],
      groupRecords: [
        { contactId: 1, startDate: '2025-08-31T10:27:00', endDate: null },
        { contactId: 2, startDate: '2025-09-01T00:00:00', endDate: null },
      ],
      adultContactIds: [1, 3],
    };
    const result = computeEngagementOverlap(rawData, [serving('2025-08-31T11:30:00', null, 3)], augStart, augEnd);
    expect(result.totalGroup).toBe(1);
    expect(result.totalServing).toBe(1);
  });
});
