import {
  DashboardData,
  PeriodMetrics,
  MonthlyAttendanceTrend,
  SmallGroupTrend,
  YearOverYearMetrics,
  WeeklyAttendanceTrend,
  CommunityAttendanceTrend,
  RosterVsAttendance,
  ServingLeadingRecord,
  ServingTrend,
  ServingByRoleType,
  ServingByMinistry,
  EngagementOverlap,
  EngagementRawData,
} from '@/lib/dto';
import {
  DateRangeSelection,
  selectionToDateRange,
  getPreviousPeriodRange,
} from './date-range-filter';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Derive monthName from YYYY-MM if missing (handles stale cached data) */
function ensureMonthName(item: SmallGroupTrend): SmallGroupTrend {
  if (item.monthName) return item;
  const [, m] = item.month.split('-').map(Number);
  return { ...item, monthName: MONTH_NAMES[m - 1] };
}

/**
 * Detect whether the selection represents a single month in a single year.
 * When true, charts should show weekly (per-date) data points instead of monthly averages.
 */
export function isSingleMonthSelection(selection: DateRangeSelection): boolean {
  return selection.months.length === 1 && selection.years.length === 1;
}

/**
 * Filters the full-range dashboard data to match the user's date selection.
 * Runs entirely client-side — no server round-trip needed.
 *
 * Time-series data (monthly attendance, community attendance, small group trends)
 * is filtered by date. Aggregate metrics (PeriodMetrics, YearOverYear) are
 * recomputed from the filtered monthly data. Non-time-series data (groupTypeMetrics,
 * eventTypeMetrics, baptisms) is passed through unchanged.
 *
 * When a single month is selected, weekly (per-date) data points are substituted
 * for monthly averages so charts show individual data points for that month.
 */
export function filterDashboardData(
  fullData: DashboardData,
  selection: DateRangeSelection
): DashboardData {
  const { startDate, endDate } = selectionToDateRange(selection);
  const singleMonth = isSingleMonthSelection(selection);

  // Filter time-series arrays by the selected date range
  let monthlyAttendanceTrends = filterMonthlyTrends(
    fullData.monthlyAttendanceTrends,
    startDate,
    endDate
  );

  let communityAttendanceTrends = fullData.communityAttendanceTrends.filter(week => {
    const [y, m, d] = week.weekStartDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date >= startDate && date <= endDate;
  });

  const smallGroupTrends = filterMonthlyByDate(
    fullData.smallGroupTrends,
    startDate,
    endDate
  ).map(ensureMonthName);

  // Compute previous period ranges:
  // - Full range (prevStart → prevEnd) for trend line charts
  // - Capped range (prevStart → prevMetricsEnd) for aggregate metric cards
  //   This ensures apples-to-apples comparison: if the current period only has
  //   data through today, the previous period metrics are capped to the same
  //   elapsed number of days (today shifted back one year).
  const { startDate: prevStart, endDate: prevEnd } = getPreviousPeriodRange(startDate, endDate);
  const today = new Date();
  const todayPrevYear = new Date(today);
  todayPrevYear.setFullYear(todayPrevYear.getFullYear() - 1);
  // Cap the previous metrics end date to the lesser of the full previous end
  // or today-minus-one-year (so partial current periods get fair comparisons)
  const prevMetricsEnd = todayPrevYear < prevEnd ? todayPrevYear : prevEnd;

  // Previous year community attendance for YoY comparison
  let previousYearCommunityAttendanceTrends = filterCommunityByDateRange(
    fullData.communityAttendanceTrends,
    prevStart,
    prevEnd
  );

  let previousYearMonthlyAttendanceTrends = filterMonthlyTrends(
    fullData.monthlyAttendanceTrends,
    prevStart,
    prevEnd
  );
  const previousYearSmallGroupTrends = filterMonthlyByDate(
    fullData.smallGroupTrends,
    prevStart,
    prevEnd
  ).map(ensureMonthName);

  // When a single month is selected, substitute weekly data for monthly averages
  // so charts show individual data points instead of one aggregated value
  if (singleMonth) {
    const weeklyFiltered = filterWeeklyTrends(
      fullData.weeklyAttendanceTrends,
      startDate,
      endDate
    );

    // Convert weekly attendance data to MonthlyAttendanceTrend format
    // so the chart component can render it without changes to its interface
    monthlyAttendanceTrends = weeklyFiltered.map(w => ({
      month: w.eventDate,
      monthName: w.dateLabel,
      averageInPersonAttendance: w.inPersonAttendance,
      averageOnlineAttendance: w.onlineAttendance,
      averageTotalAttendance: w.totalAttendance,
      eventCount: w.eventCount
    }));

    // Use weekly community data for the selected month
    communityAttendanceTrends = filterCommunityByDateRange(
      fullData.weeklyCommunityAttendanceTrends,
      startDate,
      endDate
    );

    // Previous year weekly community data for comparison
    previousYearCommunityAttendanceTrends = filterCommunityByDateRange(
      fullData.weeklyCommunityAttendanceTrends,
      prevStart,
      prevEnd
    );

    // Previous year weekly data for comparison
    const prevWeeklyFiltered = filterWeeklyTrends(
      fullData.weeklyAttendanceTrends,
      prevStart,
      prevEnd
    );
    previousYearMonthlyAttendanceTrends = prevWeeklyFiltered.map(w => ({
      month: w.eventDate,
      monthName: w.dateLabel,
      averageInPersonAttendance: w.inPersonAttendance,
      averageOnlineAttendance: w.onlineAttendance,
      averageTotalAttendance: w.totalAttendance,
      eventCount: w.eventCount
    }));
  }

  // Recompute aggregate PeriodMetrics from filtered monthly data
  const currentPeriod = computePeriodMetrics(monthlyAttendanceTrends, startDate, endDate);

  // For the previous period metrics (number cards), use capped data so the
  // comparison covers the same elapsed duration as the current period.
  // Use weekly data for precise date-level filtering when available.
  const prevMetricsWeekly = filterWeeklyTrends(fullData.weeklyAttendanceTrends, prevStart, prevMetricsEnd);
  const prevMetricsMonthly = prevMetricsWeekly.length > 0
    ? prevMetricsWeekly.map(w => ({
        month: w.eventDate,
        monthName: w.dateLabel,
        averageInPersonAttendance: w.inPersonAttendance,
        averageOnlineAttendance: w.onlineAttendance,
        averageTotalAttendance: w.totalAttendance,
        eventCount: w.eventCount,
      }))
    : filterMonthlyTrends(fullData.monthlyAttendanceTrends, prevStart, prevMetricsEnd);
  const previousPeriod = computePeriodMetrics(prevMetricsMonthly, prevStart, prevMetricsEnd);

  // Recompute year-over-year from the recomputed period metrics
  const yearOverYear = computeYearOverYear(currentPeriod, previousPeriod);

  // Compute all serving metrics from raw records for the selected date range
  const {
    servingTrends,
    servingByRoleType,
    servingByMinistry,
    totalServingLeading,
  } = computeServingMetrics(fullData.servingLeadingRecords, startDate, endDate);

  // Compute previous year serving trends for YoY comparison
  const { servingTrends: previousYearServingTrends } = computeServingMetrics(
    fullData.servingLeadingRecords, prevStart, prevEnd
  );

  // Count milestone dates: current period vs capped previous period
  const baptismsCurrentPeriod = countDatesInRange(fullData.baptismDates, startDate, endDate);
  const baptismsPreviousPeriod = countDatesInRange(fullData.baptismDates, prevStart, prevMetricsEnd);
  const membershipCurrentPeriod = countDatesInRange(fullData.membershipDates, startDate, endDate)
    - countDatesInRange(fullData.membershipDroppedDates, startDate, endDate);
  const membershipPreviousPeriod = countDatesInRange(fullData.membershipDates, prevStart, prevMetricsEnd)
    - countDatesInRange(fullData.membershipDroppedDates, prevStart, prevMetricsEnd);

  // Unique Event Participants: filter monthly buckets to selected range, count unique PIDs
  const filteredEPMonths = filterMonthlyByDate(fullData.eventParticipantsByMonth, startDate, endDate);
  const uniquePids = new Set<number>();
  for (const m of filteredEPMonths) {
    for (const pid of m.participantIds) uniquePids.add(pid);
  }
  const uniqueEventParticipants = uniquePids.size;

  // Roster vs Attendance: filter raw records by selected date range, aggregate by group type
  const rosterVsAttendance = computeRosterVsAttendance(
    fullData.rosterMemberRecords,
    fullData.attendanceByMonth,
    startDate,
    endDate
  );

  // Engagement Venn: compute overlap from raw data for selected date range
  const engagementOverlap = computeEngagementOverlap(
    fullData.engagementRawData,
    fullData.servingLeadingRecords,
    startDate,
    endDate
  );

  return {
    ...fullData,
    currentPeriod,
    previousPeriod,
    monthlyAttendanceTrends,
    previousYearMonthlyAttendanceTrends,
    communityAttendanceTrends,
    previousYearCommunityAttendanceTrends,
    smallGroupTrends,
    previousYearSmallGroupTrends,
    yearOverYear,
    servingTrends,
    previousYearServingTrends,
    servingByRoleType,
    servingByMinistry,
    totalServingLeading,
    engagementOverlap,
    baptismsCurrentPeriod,
    baptismsPreviousPeriod,
    membershipCurrentPeriod,
    membershipPreviousPeriod,
    uniqueEventParticipants,
    rosterVsAttendance,
  };
}

/** Filter WeeklyAttendanceTrend[] by date range (eventDate is YYYY-MM-DD) */
function filterWeeklyTrends(
  trends: WeeklyAttendanceTrend[],
  startDate: Date,
  endDate: Date
): WeeklyAttendanceTrend[] {
  return trends.filter(t => {
    const [y, m, d] = t.eventDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date >= startDate && date <= endDate;
  });
}

/** Filter CommunityAttendanceTrend[] by date range (weekStartDate is YYYY-MM-DD) */
function filterCommunityByDateRange(
  trends: CommunityAttendanceTrend[],
  startDate: Date,
  endDate: Date
): CommunityAttendanceTrend[] {
  return trends.filter(t => {
    const [y, m, d] = t.weekStartDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date >= startDate && date <= endDate;
  });
}

/** Filter MonthlyAttendanceTrend[] by date range (month field is YYYY-MM) */
function filterMonthlyTrends(
  trends: MonthlyAttendanceTrend[],
  startDate: Date,
  endDate: Date
): MonthlyAttendanceTrend[] {
  return trends.filter(t => {
    const [y, m] = t.month.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date >= new Date(startDate.getFullYear(), startDate.getMonth(), 1) &&
           date <= new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  });
}

/** Filter any array with a `month` field (YYYY-MM) by date range */
function filterMonthlyByDate<T extends { month: string }>(
  items: T[],
  startDate: Date,
  endDate: Date
): T[] {
  return items.filter(item => {
    const [y, m] = item.month.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date >= new Date(startDate.getFullYear(), startDate.getMonth(), 1) &&
           date <= new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  });
}

/** Count ISO date strings that fall within a date range */
function countDatesInRange(dates: string[], startDate: Date, endDate: Date): number {
  return dates.filter(d => {
    const date = new Date(d);
    return date >= startDate && date <= endDate;
  }).length;
}

/**
 * Compute PeriodMetrics from filtered monthly attendance data.
 * Uses weighted averages (by event count) for attendance figures.
 */
function computePeriodMetrics(
  monthly: MonthlyAttendanceTrend[],
  startDate: Date,
  endDate: Date
): PeriodMetrics {
  if (monthly.length === 0) {
    return {
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
      averageAttendance: 0,
      averageInPersonAttendance: 0,
      averageOnlineAttendance: 0,
      totalEvents: 0,
    };
  }

  const totalEvents = monthly.reduce((sum, m) => sum + m.eventCount, 0);

  // Weighted average: sum(monthAvg * monthEventCount) / totalEvents
  const avgInPerson = totalEvents > 0
    ? Math.round(monthly.reduce((sum, m) => sum + m.averageInPersonAttendance * m.eventCount, 0) / totalEvents)
    : 0;
  const avgOnline = totalEvents > 0
    ? Math.round(monthly.reduce((sum, m) => sum + m.averageOnlineAttendance * m.eventCount, 0) / totalEvents)
    : 0;
  const avgTotal = totalEvents > 0
    ? Math.round(monthly.reduce((sum, m) => sum + m.averageTotalAttendance * m.eventCount, 0) / totalEvents)
    : 0;

  return {
    periodStart: startDate.toISOString(),
    periodEnd: endDate.toISOString(),
    averageAttendance: avgTotal,
    averageInPersonAttendance: avgInPerson,
    averageOnlineAttendance: avgOnline,
    totalEvents,
  };
}

/** Compute year-over-year comparison metrics from current and previous period */
function computeYearOverYear(
  current: PeriodMetrics,
  previous: PeriodMetrics
): YearOverYearMetrics[] {
  const pctChange = (cur: number, prev: number): number => {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const trend = (cur: number, prev: number): 'up' | 'down' | 'stable' => {
    const change = pctChange(cur, prev);
    if (change > 2) return 'up';
    if (change < -2) return 'down';
    return 'stable';
  };

  return [
    {
      metric: 'Average Attendance',
      currentYear: current.averageAttendance,
      previousYear: previous.averageAttendance,
      percentageChange: pctChange(current.averageAttendance, previous.averageAttendance),
      trend: trend(current.averageAttendance, previous.averageAttendance),
    },
    {
      metric: 'Total Events',
      currentYear: current.totalEvents,
      previousYear: previous.totalEvents,
      percentageChange: pctChange(current.totalEvents, previous.totalEvents),
      trend: trend(current.totalEvents, previous.totalEvents),
    },
    {
      metric: 'Avg In-Person',
      currentYear: current.averageInPersonAttendance,
      previousYear: previous.averageInPersonAttendance,
      percentageChange: pctChange(current.averageInPersonAttendance, previous.averageInPersonAttendance),
      trend: trend(current.averageInPersonAttendance, previous.averageInPersonAttendance),
    },
    {
      metric: 'Avg Online',
      currentYear: current.averageOnlineAttendance,
      previousYear: previous.averageOnlineAttendance,
      percentageChange: pctChange(current.averageOnlineAttendance, previous.averageOnlineAttendance),
      trend: trend(current.averageOnlineAttendance, previous.averageOnlineAttendance),
    },
  ];
}

/**
 * Compute RosterVsAttendance[] from raw records filtered to a date range.
 * Roster: unique contacts whose membership overlaps the date range.
 * Attendance: unique contacts who attended events in the date range (by month buckets).
 */
function computeRosterVsAttendance(
  rosterRecords: DashboardData['rosterMemberRecords'],
  attendanceByMonth: DashboardData['attendanceByMonth'],
  startDate: Date,
  endDate: Date
): RosterVsAttendance[] {
  if (rosterRecords.length === 0 && attendanceByMonth.length === 0) return [];

  // Roster: filter to records whose date range overlaps the selected period
  const typeRoster = new Map<number, { name: string; contacts: Set<number> }>();
  for (const r of rosterRecords) {
    const rStart = new Date(r.startDate);
    const rEnd = r.endDate ? new Date(r.endDate) : endDate;
    // Overlap check: record starts before period ends AND record ends after period starts
    if (rStart <= endDate && rEnd >= startDate) {
      if (!typeRoster.has(r.groupTypeId)) {
        typeRoster.set(r.groupTypeId, { name: r.groupTypeName, contacts: new Set() });
      }
      typeRoster.get(r.groupTypeId)!.contacts.add(r.contactId);
    }
  }

  // Attendance: filter monthly buckets to selected range, aggregate by group type
  const typeAttendance = new Map<number, { name: string; contacts: Set<number> }>();
  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  for (const m of attendanceByMonth) {
    const [y, mo] = m.month.split('-').map(Number);
    const monthDate = new Date(y, mo - 1, 1);
    if (monthDate >= startMonth && monthDate <= endMonth) {
      if (!typeAttendance.has(m.groupTypeId)) {
        typeAttendance.set(m.groupTypeId, { name: m.groupTypeName, contacts: new Set() });
      }
      for (const cid of m.contactIds) {
        typeAttendance.get(m.groupTypeId)!.contacts.add(cid);
      }
    }
  }

  // Combine all group type IDs from both maps
  const allTypeIds = new Set([...typeRoster.keys(), ...typeAttendance.keys()]);
  return [...allTypeIds]
    .map(typeId => ({
      groupTypeName: typeRoster.get(typeId)?.name || typeAttendance.get(typeId)?.name || 'Unknown',
      rosterCount: typeRoster.get(typeId)?.contacts.size || 0,
      attendanceCount: typeAttendance.get(typeId)?.contacts.size || 0,
    }))
    .filter(r => r.rosterCount > 0 || r.attendanceCount > 0);
}

/**
 * Compute all serving metrics from raw serving/leading records for a date range.
 * Replaces 4 separate server-side methods with a single client-side computation.
 */
function computeServingMetrics(
  records: ServingLeadingRecord[],
  startDate: Date,
  endDate: Date
): {
  servingTrends: ServingTrend[];
  servingByRoleType: ServingByRoleType[];
  servingByMinistry: ServingByMinistry[];
  totalServingLeading: number;
} {
  if (records.length === 0) {
    return { servingTrends: [], servingByRoleType: [], servingByMinistry: [], totalServingLeading: 0 };
  }

  // Filter records to those overlapping the selected period
  const active = records.filter(r => {
    const rStart = new Date(r.startDate);
    const rEnd = r.endDate ? new Date(r.endDate) : endDate;
    return rStart <= endDate && rEnd >= startDate;
  });

  // Total unique contacts serving/leading in the period
  const uniqueContacts = new Set(active.map(r => r.contactId));
  const totalServingLeading = uniqueContacts.size;

  // By Role Type: group by roleTypeId, count unique contacts
  const byRoleType = new Map<number, { name: string; contacts: Set<number> }>();
  for (const r of active) {
    if (!byRoleType.has(r.roleTypeId)) {
      byRoleType.set(r.roleTypeId, { name: r.roleTypeName, contacts: new Set() });
    }
    byRoleType.get(r.roleTypeId)!.contacts.add(r.contactId);
  }
  const servingByRoleType: ServingByRoleType[] = Array.from(byRoleType.entries()).map(([typeId, data]) => ({
    roleTypeId: typeId,
    roleTypeName: data.name,
    uniqueContacts: data.contacts.size,
  }));

  // By Ministry: group by ministryId, count unique contacts, sort descending
  const byMinistry = new Map<number, { name: string; contacts: Set<number> }>();
  for (const r of active) {
    if (r.ministryId === null) continue;
    if (!byMinistry.has(r.ministryId)) {
      byMinistry.set(r.ministryId, { name: r.ministryName || 'Unknown', contacts: new Set() });
    }
    byMinistry.get(r.ministryId)!.contacts.add(r.contactId);
  }
  const servingByMinistry: ServingByMinistry[] = Array.from(byMinistry.entries())
    .map(([ministryId, data]) => ({
      ministryId,
      ministryName: data.name,
      uniqueContacts: data.contacts.size,
    }))
    .sort((a, b) => b.uniqueContacts - a.uniqueContacts);

  // Serving Trends: iterate months in range, check overlap for each record
  const servingTrends: ServingTrend[] = [];
  const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (currentDate <= endMonth) {
    const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const servingContacts = new Set<number>();
    const leadingContacts = new Set<number>();
    const allContacts = new Set<number>();

    for (const r of records) {
      const rStart = new Date(r.startDate);
      const rEnd = r.endDate ? new Date(r.endDate) : monthEnd;
      if (rStart <= monthEnd && rEnd >= monthStart) {
        allContacts.add(r.contactId);
        if (r.roleTypeId === 3) servingContacts.add(r.contactId);
        if (r.roleTypeId === 1) leadingContacts.add(r.contactId);
      }
    }

    servingTrends.push({
      month: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
      monthName: MONTH_NAMES[currentDate.getMonth()],
      servingCount: servingContacts.size,
      leadingCount: leadingContacts.size,
      totalCount: allContacts.size,
    });

    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return { servingTrends, servingByRoleType, servingByMinistry, totalServingLeading };
}

/**
 * Compute the engagement venn diagram overlap from raw data for the selected date range.
 * Three dimensions: Activity (monthly buckets), Groups (date-range records), Serving (from serving records).
 * Uses pre-computed adult contact IDs to filter the serving dimension.
 */
function computeEngagementOverlap(
  rawData: EngagementRawData,
  servingRecords: ServingLeadingRecord[],
  startDate: Date,
  endDate: Date
): EngagementOverlap {
  const empty: EngagementOverlap = {
    activityOnly: 0, groupOnly: 0, servingOnly: 0,
    activityAndGroup: 0, activityAndServing: 0, groupAndServing: 0,
    allThree: 0, totalActivity: 0, totalGroup: 0, totalServing: 0,
  };

  if (!rawData || (rawData.activityByMonth.length === 0 && rawData.groupRecords.length === 0 && servingRecords.length === 0)) {
    return empty;
  }

  // Activity set: filter monthly buckets to selected range, union contact IDs
  const activityContacts = new Set<number>();
  const filteredActivity = filterMonthlyByDate(rawData.activityByMonth, startDate, endDate);
  for (const bucket of filteredActivity) {
    for (const id of bucket.contactIds) activityContacts.add(id);
  }

  // Group set: filter records by date overlap
  const groupContacts = new Set<number>();
  for (const r of rawData.groupRecords) {
    const rStart = new Date(r.startDate);
    const rEnd = r.endDate ? new Date(r.endDate) : endDate;
    if (rStart <= endDate && rEnd >= startDate) {
      groupContacts.add(r.contactId);
    }
  }

  // Serving set: filter records by date overlap, intersect with adult IDs
  const adultSet = new Set(rawData.adultContactIds);
  const servingContacts = new Set<number>();
  for (const r of servingRecords) {
    const rStart = new Date(r.startDate);
    const rEnd = r.endDate ? new Date(r.endDate) : endDate;
    if (rStart <= endDate && rEnd >= startDate && adultSet.has(r.contactId)) {
      servingContacts.add(r.contactId);
    }
  }

  // Compute 7 venn regions using set intersection/difference
  const allThree = new Set([...activityContacts].filter(c => groupContacts.has(c) && servingContacts.has(c)));
  const actAndGroup = new Set([...activityContacts].filter(c => groupContacts.has(c) && !servingContacts.has(c)));
  const actAndServing = new Set([...activityContacts].filter(c => !groupContacts.has(c) && servingContacts.has(c)));
  const groupAndServing = new Set([...groupContacts].filter(c => !activityContacts.has(c) && servingContacts.has(c)));
  const actOnly = new Set([...activityContacts].filter(c => !groupContacts.has(c) && !servingContacts.has(c)));
  const groupOnlySet = new Set([...groupContacts].filter(c => !activityContacts.has(c) && !servingContacts.has(c)));
  const servingOnly = new Set([...servingContacts].filter(c => !activityContacts.has(c) && !groupContacts.has(c)));

  return {
    activityOnly: actOnly.size,
    groupOnly: groupOnlySet.size,
    servingOnly: servingOnly.size,
    activityAndGroup: actAndGroup.size,
    activityAndServing: actAndServing.size,
    groupAndServing: groupAndServing.size,
    allThree: allThree.size,
    totalActivity: activityContacts.size,
    totalGroup: groupContacts.size,
    totalServing: servingContacts.size,
  };
}
