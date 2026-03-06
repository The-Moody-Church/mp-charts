import { cacheLife, cacheTag } from 'next/cache';
import { MPHelper } from '@/lib/providers/ministry-platform';
import { sanitizeIds } from '@/lib/providers/ministry-platform/utils/filter-sanitize';
import {
  DashboardData,
  PeriodMetrics,
  GroupTypeMetrics,
  SmallGroupTrend,
  MonthlyAttendanceTrend,
  WeeklyAttendanceTrend,
  CommunityAttendanceTrend,
  ServingLeadingRecord,
  EngagementRawData,
  EventParticipantMonth,
  RosterMemberRecord,
  AttendanceMonthRecord,
} from '@/lib/dto';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Cached Group_Types lookup (24-hour cache via 'use cache')
 * The `ids` parameter is automatically part of the cache key.
 */
async function getCachedGroupTypes(ids: string) {
  'use cache';
  cacheLife({ revalidate: 86400 });
  cacheTag('group-types');

  const mp = new MPHelper();
  return mp.getTableRecords<{
    Group_Type_ID: number;
    Group_Type: string;
  }>({
    table: 'Group_Types',
    select: 'Group_Type_ID,Group_Type',
    filter: `Group_Type_ID IN (${sanitizeIds(ids.split(',').map(Number))})`
  });
}

/**
 * DashboardService - Singleton service for managing dashboard metrics
 *
 * This service provides methods to fetch and aggregate dashboard data from Ministry Platform,
 * including group participation, event attendance, and year-over-year comparisons.
 * Uses the singleton pattern to ensure a single instance across the application.
 */
export class DashboardService {
  private static instance: DashboardService;
  private mp: MPHelper | null = null;

  private constructor() {}

  /**
   * Returns a DashboardService instance.
   * @param accessToken Optional user access token from the OIDC session. When provided,
   *                    creates a per-request instance that authenticates as the logged-in
   *                    user (respecting their MP permissions and producing accurate audit logs).
   *                    When omitted, returns the singleton instance using client credentials.
   *
   * Note: Cached lookups (Group_Types, Event_Types via 'use cache') always use client
   * credentials since they run outside user request context. The main data queries
   * use the access token when provided.
   */
  public static async getInstance(accessToken?: string): Promise<DashboardService> {
    if (accessToken) {
      const instance = new DashboardService();
      instance.mp = new MPHelper({ accessToken });
      return instance;
    }
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
      DashboardService.instance.mp = new MPHelper();
    }
    return DashboardService.instance;
  }

  /**
   * Gets Group_Types with 24-hour cache via 'use cache'
   */
  private async getGroupTypesWithCache(groupTypeIds: Set<number>) {
    const ids = Array.from(groupTypeIds).sort().join(',');
    return getCachedGroupTypes(ids);
  }

  /**
   * Batches a large array of IDs into multiple getTableRecords calls to avoid
   * IIS URL length limits (~4096 chars). Results are concatenated.
   */
  private async batchGetTableRecords<T>(options: {
    table: string;
    select: string;
    ids: number[];
    idColumn: string;
    extraFilter?: string;
    batchSize?: number;
  }): Promise<T[]> {
    const { table, select, ids, idColumn, extraFilter, batchSize = 100 } = options;
    if (ids.length === 0) return [];

    const results: T[] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      const batchIds = ids.slice(i, i + batchSize);
      const safeIds = sanitizeIds(batchIds);
      const filter = extraFilter
        ? `${idColumn} IN (${safeIds}) AND ${extraFilter}`
        : `${idColumn} IN (${safeIds})`;
      const batch = await this.mp!.getTableRecords<T>({ table, select, filter });
      // Use concat instead of push(...batch) to avoid stack overflow with large arrays
      for (const item of batch) results.push(item);
    }
    return results;
  }

  /**
   * Gets complete dashboard data for current and previous ministry years
   *
   * @param currentYearStart - Start date of current ministry year
   * @param currentYearEnd - End date of current ministry year
   * @returns Promise<DashboardData> - Complete dashboard metrics
   */
  public async getDashboardData(
    currentYearStart: Date,
    currentYearEnd: Date
  ): Promise<DashboardData> {
    // Calculate previous period dates (one year earlier)
    const previousYearStart = new Date(currentYearStart);
    previousYearStart.setFullYear(previousYearStart.getFullYear() - 1);
    const previousYearEnd = new Date(currentYearEnd);
    previousYearEnd.setFullYear(previousYearEnd.getFullYear() - 1);

    // Fetch core metrics in parallel (fast queries only)
    const [
      currentPeriod,
      previousPeriod,
      groupTypeMetrics,
      smallGroupTrends,
      communityTrends,
      monthlyAttendanceTrends,
      previousYearMonthlyAttendanceTrends,
      weeklyAttendanceTrends,
      baptismDates,
      membershipDates,
      membershipDroppedDates,
    ] = await Promise.all([
      this.getPeriodMetrics(currentYearStart, currentYearEnd),
      this.getPeriodMetrics(previousYearStart, previousYearEnd),
      this.getGroupTypeMetrics(currentYearStart, currentYearEnd),
      this.getSmallGroupTrends(currentYearStart, currentYearEnd),
      this.getCommunityAttendanceTrends(currentYearStart, currentYearEnd),
      this.getMonthlyAttendanceTrends(currentYearStart, currentYearEnd),
      this.getMonthlyAttendanceTrends(previousYearStart, previousYearEnd),
      this.getWeeklyAttendanceTrends(currentYearStart, currentYearEnd),
      this.getMilestoneDates(3, currentYearStart, currentYearEnd),           // Baptism
      this.getMilestoneDates(48, currentYearStart, currentYearEnd),          // Registered Member
      this.getMilestoneDates(49, currentYearStart, currentYearEnd),          // Dropped Membership
    ]);

    return {
      currentPeriod,
      previousPeriod,
      groupTypeMetrics,
      yearOverYear: [], // Computed client-side by filterDashboardData
      smallGroupTrends,
      previousYearSmallGroupTrends: [], // Computed client-side by filterDashboardData
      communityAttendanceTrends: communityTrends.monthly,
      previousYearCommunityAttendanceTrends: [], // Computed client-side by filterDashboardData
      monthlyAttendanceTrends,
      previousYearMonthlyAttendanceTrends,
      weeklyAttendanceTrends,
      weeklyCommunityAttendanceTrends: communityTrends.weekly,
      baptismDates,
      membershipDates,
      membershipDroppedDates,
      baptismsCurrentPeriod: 0,  // Computed client-side by filterDashboardData
      baptismsPreviousPeriod: 0,
      membershipCurrentPeriod: 0,
      membershipPreviousPeriod: 0,
      // Extended fields — defaults until loaded separately
      uniqueEventParticipants: 0, // Computed client-side by filterDashboardData
      eventParticipantsByMonth: [],
      rosterVsAttendance: [], // Computed client-side by filterDashboardData
      rosterMemberRecords: [],
      attendanceByMonth: [],
      servingLeadingRecords: [],
      servingTrends: [],
      previousYearServingTrends: [],
      servingByRoleType: [],
      servingByMinistry: [],
      totalServingLeading: 0,
      engagementOverlap: {
        activityOnly: 0, groupOnly: 0, servingOnly: 0,
        activityAndGroup: 0, activityAndServing: 0, groupAndServing: 0,
        allThree: 0, totalActivity: 0, totalGroup: 0, totalServing: 0,
      },
      engagementRawData: { activityByMonth: [], groupRecords: [], adultContactIds: [] },
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Gets extended dashboard data (heavy queries) loaded separately for progressive rendering.
   * Date-filterable data (event participants, roster/attendance) uses the full range so
   * filterDashboardData can recompute when the user changes the date selection.
   * Snapshot metrics (serving, engagement) use last 12 months.
   *
   * @param fullRangeStart - Start of the full selectable range (for date-filterable data)
   * @param fullRangeEnd - End of the full selectable range (for date-filterable data)
   */
  public async getExtendedDashboardData(fullRangeStart: Date, fullRangeEnd: Date): Promise<Partial<DashboardData>> {
    // All three queries run in parallel — no sequential dependency
    const [
      eventParticipantsByMonth,
      rosterAndAttendance,
      servingLeadingRecords,
    ] = await Promise.all([
      this.getEventParticipantsByMonth(fullRangeStart, fullRangeEnd),
      this.getRosterAndAttendanceRaw(fullRangeStart, fullRangeEnd),
      this.getServingLeadingRaw(fullRangeStart, fullRangeEnd),
    ]);

    return {
      eventParticipantsByMonth,
      rosterMemberRecords: rosterAndAttendance.rosterMemberRecords,
      attendanceByMonth: rosterAndAttendance.attendanceByMonth,
      uniqueEventParticipants: 0, // Computed client-side by filterDashboardData
      rosterVsAttendance: [], // Computed client-side by filterDashboardData
      servingLeadingRecords,
      // Computed client-side by filterDashboardData from servingLeadingRecords:
      servingTrends: [],
      servingByRoleType: [],
      servingByMinistry: [],
      totalServingLeading: 0,
    };
  }

  /**
   * Gets engagement venn diagram data (Activity_Log + Groups + adult filter).
   * Loaded separately from extended data because the Activity_Log query is slow.
   * Self-contained: fetches its own serving contact IDs for the adult filter.
   */
  public async getEngagementDashboardData(fullRangeStart: Date, fullRangeEnd: Date): Promise<Partial<DashboardData>> {
    const engagementRawData = await this.getEngagementRawData(fullRangeStart, fullRangeEnd);

    return {
      engagementOverlap: {
        activityOnly: 0, groupOnly: 0, servingOnly: 0,
        activityAndGroup: 0, activityAndServing: 0, groupAndServing: 0,
        allThree: 0, totalActivity: 0, totalGroup: 0, totalServing: 0,
      },
      engagementRawData,
    };
  }

  /**
   * Gets group participation metrics by group type
   *
   * @param startDate - Start date of period
   * @param endDate - End date of period
   * @returns Promise<GroupTypeMetrics[]> - Group metrics by type
   */
  private async getGroupTypeMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<GroupTypeMetrics[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Step 1: Get active groups for the period
      const groups = await this.mp!.getTableRecords<{
        Group_ID: number;
        Group_Type_ID: number;
        Ministry_ID: number | null;
      }>({
        table: 'Groups',
        select: 'Group_ID,Group_Type_ID,Ministry_ID',
        filter: `
          Groups.Start_Date <= '${endIso}' AND
          (Groups.End_Date IS NULL OR Groups.End_Date >= '${startIso}')
        `
      });

      if (groups.length === 0) return [];

      // Step 2: Get all group types to identify which to exclude (cached 24 hours)
      const groupTypeIds = new Set(groups.map(g => g.Group_Type_ID));
      const groupTypes = await this.getGroupTypesWithCache(groupTypeIds);

      // Filter out childcare groups (Group_Type_ID = 13)
      const filteredGroups = groups.filter(g => g.Group_Type_ID !== 13);
      const activeGroupIds = new Set(filteredGroups.map(g => g.Group_ID));
      if (activeGroupIds.size === 0) return [];

      const filteredGroupTypes = groupTypes.filter(gt => gt.Group_Type_ID !== 13);
      const groupTypeMap = new Map(filteredGroupTypes.map(gt => [gt.Group_Type_ID, gt.Group_Type]));
      const groupToTypeMap = new Map(filteredGroups.map(g => [g.Group_ID, g.Group_Type_ID]));
      const groupToMinistryMap = new Map(filteredGroups.map(g => [g.Group_ID, g.Ministry_ID ?? null]));

      // Step 3: Get group participants for active groups
      // Batched to avoid IIS URL length limits with large ID sets
      const groupParticipants = await this.batchGetTableRecords<{
        Group_Participant_ID: number;
        Group_ID: number;
        Participant_ID: number;
      }>({
        table: 'Group_Participants',
        select: 'Group_Participant_ID,Group_ID,Participant_ID',
        ids: Array.from(activeGroupIds),
        idColumn: 'Group_Participants.Group_ID',
        extraFilter: `Group_Participants.Start_Date <= '${endIso}' AND (Group_Participants.End_Date IS NULL OR Group_Participants.End_Date >= '${startIso}')`
      });

      // Aggregate by group type
      const metricsMap = new Map<number, {
        groupTypeName: string;
        ministryId: number | null;
        groupIds: Set<number>;
        participantIds: Set<number>;
        totalParticipants: number;
      }>();

      for (const gp of groupParticipants) {
        const groupTypeId = groupToTypeMap.get(gp.Group_ID);
        if (!groupTypeId) continue;

        const groupTypeName = groupTypeMap.get(groupTypeId) || 'Unknown';

        if (!metricsMap.has(groupTypeId)) {
          metricsMap.set(groupTypeId, {
            groupTypeName,
            ministryId: groupToMinistryMap.get(gp.Group_ID) ?? null,
            groupIds: new Set(),
            participantIds: new Set(),
            totalParticipants: 0
          });
        }

        const metrics = metricsMap.get(groupTypeId)!;
        metrics.groupIds.add(gp.Group_ID);
        metrics.participantIds.add(gp.Participant_ID);
        metrics.totalParticipants++;
      }

      // Convert to array format
      return Array.from(metricsMap.entries()).map(([groupTypeId, metrics]) => ({
        groupTypeId,
        groupTypeName: metrics.groupTypeName,
        ministryId: metrics.ministryId,
        activeGroupCount: metrics.groupIds.size,
        totalParticipants: metrics.totalParticipants,
        uniqueParticipants: metrics.participantIds.size,
        averageGroupSize: metrics.groupIds.size > 0
          ? Math.round(metrics.participantIds.size / metrics.groupIds.size)
          : 0
      }));
    } catch (error) {
      console.error('Error fetching group type metrics:', error);
      return [];
    }
  }

  /**
   * Gets overall period metrics (attendance summary)
   *
   * @param startDate - Start date of period
   * @param endDate - End date of period
   * @returns Promise<PeriodMetrics> - Overall period metrics
   */
  private async getPeriodMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<PeriodMetrics> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Step 1: Get events for the period (Event_Type_ID = 7 for Worship Services)
      const events = await this.mp!.getTableRecords<{
        Event_ID: number;
      }>({
        table: 'Events',
        select: 'Event_ID',
        filter: `
          Events.Event_Start_Date >= '${startIso}' AND
          Events.Event_End_Date <= '${endIso}' AND
          Events.Cancelled = 0 AND
          Events.Event_Type_ID = 7
        `
      });

      const eventIds = new Set(events.map(e => e.Event_ID));

      if (eventIds.size === 0) {
        return {
          periodStart: startIso,
          periodEnd: endIso,
          averageAttendance: 0,
          averageInPersonAttendance: 0,
          averageOnlineAttendance: 0,
          totalEvents: 0
        };
      }

      // Step 2: Get attendance metrics from Event_Metrics (Metric_ID 2 = In-Person, 3 = Online)
      // Batched to avoid IIS URL length limits with large ID sets
      const eventMetrics = await this.batchGetTableRecords<{
        Event_Metric_ID: number;
        Event_ID: number;
        Metric_ID: number;
        Numerical_Value: number;
      }>({
        table: 'Event_Metrics',
        select: 'Event_Metric_ID,Event_ID,Metric_ID,Numerical_Value',
        ids: Array.from(eventIds),
        idColumn: 'Event_Metrics.Event_ID',
        extraFilter: 'Event_Metrics.Metric_ID IN (2, 3)'
      });

      // Aggregate metrics and track which events have metrics
      let totalInPerson = 0;
      let totalOnline = 0;
      const eventsWithMetrics = new Set<number>();

      for (const metric of eventMetrics) {
        eventsWithMetrics.add(metric.Event_ID);

        if (metric.Metric_ID === 2) {
          // In-Person attendance (Metric_ID = 2)
          totalInPerson += metric.Numerical_Value;
        } else if (metric.Metric_ID === 3) {
          // Online attendance (Metric_ID = 3)
          totalOnline += metric.Numerical_Value;
        }
      }

      // Only count events that have metrics recorded
      const totalEvents = eventsWithMetrics.size;
      const totalAttendance = totalInPerson + totalOnline;

      return {
        periodStart: startIso,
        periodEnd: endIso,
        totalEvents,
        averageAttendance: totalEvents > 0
          ? Math.round(totalAttendance / totalEvents)
          : 0,
        averageInPersonAttendance: totalEvents > 0
          ? Math.round(totalInPerson / totalEvents)
          : 0,
        averageOnlineAttendance: totalEvents > 0
          ? Math.round(totalOnline / totalEvents)
          : 0,
      };
    } catch (error) {
      console.error('Error fetching period metrics:', error);
      return {
        periodStart: startIso,
        periodEnd: endIso,
        averageAttendance: 0,
        averageInPersonAttendance: 0,
        averageOnlineAttendance: 0,
        totalEvents: 0
      };
    }
  }

  /**
   * Gets small group trends over time (monthly aggregation)
   *
   * @param startDate - Start date of period
   * @param endDate - End date of period
   * @returns Promise<SmallGroupTrend[]> - Monthly trend data
   */
  /**
   * Gets small group trends optimized to fetch all data once and aggregate by month
   * Reduces API calls from 27 (9 months × 3 queries) to 3 queries total
   *
   * @param startDate - Start date of period
   * @param endDate - End date of period
   * @returns Promise<SmallGroupTrend[]> - Monthly small group participation trends
   */
  private async getSmallGroupTrends(
    startDate: Date,
    endDate: Date
  ): Promise<SmallGroupTrend[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Step 1: Get active groups in Ministry_ID = 8 for the entire period (1 query)
      const smallGroups = await this.mp!.getTableRecords<{
        Group_ID: number;
        Group_Type_ID: number;
        Start_Date: string;
        End_Date: string | null;
      }>({
        table: 'Groups',
        select: 'Group_ID,Group_Type_ID,Start_Date,End_Date',
        filter: `
          Ministry_ID = 8 AND
          Groups.Start_Date <= '${endIso}' AND
          (Groups.End_Date IS NULL OR Groups.End_Date >= '${startIso}')
        `
      });

      if (smallGroups.length === 0) return [];

      const smallGroupIds = new Set(smallGroups.map(g => g.Group_ID));

      // Step 3: Get all group participants for the entire period (1 query)
      const groupParticipants = await this.mp!.getTableRecords<{
        Group_Participant_ID: number;
        Group_ID: number;
        Participant_ID: number;
        Start_Date: string;
        End_Date: string | null;
      }>({
        table: 'Group_Participants',
        select: 'Group_Participant_ID,Group_ID,Participant_ID,Start_Date,End_Date',
        filter: `
          Group_Participants.Group_ID IN (${sanitizeIds(Array.from(smallGroupIds))}) AND
          Group_Participants.Start_Date <= '${endIso}' AND
          (Group_Participants.End_Date IS NULL OR Group_Participants.End_Date >= '${startIso}')
        `
      });

      // Create a map of group ID to group info for quick lookup
      const groupMap = new Map(smallGroups.map(g => [g.Group_ID, g]));

      // Step 4: Aggregate by month in JavaScript
      const trends: SmallGroupTrend[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        // Filter groups and participants active during this month
        const activeGroupsThisMonth = new Set<number>();
        const activeParticipantsThisMonth = new Set<number>();

        for (const gp of groupParticipants) {
          const group = groupMap.get(gp.Group_ID);
          if (!group) continue;

          const gpStart = new Date(gp.Start_Date);
          const gpEnd = gp.End_Date ? new Date(gp.End_Date) : null;
          const groupStart = new Date(group.Start_Date);
          const groupEnd = group.End_Date ? new Date(group.End_Date) : null;

          // Check if group participant was active during this month
          const isGpActive = gpStart <= monthEnd && (!gpEnd || gpEnd >= monthStart);
          const isGroupActive = groupStart <= monthEnd && (!groupEnd || groupEnd >= monthStart);

          if (isGpActive && isGroupActive) {
            activeGroupsThisMonth.add(gp.Group_ID);
            activeParticipantsThisMonth.add(gp.Participant_ID);
          }
        }

        trends.push({
          month: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
          monthName: MONTH_NAMES[currentDate.getMonth()],
          activeGroupCount: activeGroupsThisMonth.size,
          totalParticipants: activeParticipantsThisMonth.size,
          averageAttendance: activeGroupsThisMonth.size > 0
            ? Math.round(activeParticipantsThisMonth.size / activeGroupsThisMonth.size)
            : 0
        });

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      return trends;
    } catch (error) {
      console.error('Error fetching small group trends:', error);
      return [];
    }
  }

  /**
   * Gets community attendance trends over time (both monthly and weekly aggregations)
   * Counts Event_Participants with status 3 or 4, filtered by:
   * - Groups with Group_Type_ID = 11 (Community)
   * - Events within ministry year date range
   *
   * @param startDate - Start date of period
   * @param endDate - End date of period
   * @returns Monthly and weekly community attendance data from the same raw data
   */
  private async getCommunityAttendanceTrends(
    startDate: Date,
    endDate: Date
  ): Promise<{ monthly: CommunityAttendanceTrend[]; weekly: CommunityAttendanceTrend[] }> {
    try {
      // Step 1: Get all Community groups (Group_Type_ID = 11)
      const communityGroups = await this.mp!.getTableRecords<{
        Group_ID: number;
        Group_Name: string;
      }>({
        table: 'Groups',
        select: 'Group_ID,Group_Name',
        filter: `Group_Type_ID = 11`
      });

      if (communityGroups.length === 0) {
        return { monthly: [], weekly: [] };
      }

      const communityGroupIds = communityGroups.map(g => g.Group_ID);
      const communityNameMap = new Map(communityGroups.map(g => [g.Group_ID, g.Group_Name]));

      // Step 2: Get Event_Participants for community groups with status 3 or 4 (Present)
      const eventParticipants = await this.mp!.getTableRecords<{
        Event_Participant_ID: number;
        Event_ID: number;
        Group_ID: number;
        Participation_Status_ID: number;
      }>({
        table: 'Event_Participants',
        select: 'Event_Participant_ID,Event_ID,Group_ID,Participation_Status_ID',
        filter: `Event_Participants.Group_ID IN (${sanitizeIds(communityGroupIds)}) AND Event_Participants.Participation_Status_ID IN (3, 4)`
      });

      if (eventParticipants.length === 0) return { monthly: [], weekly: [] };

      // Get unique Event_IDs from participants
      const uniqueEventIds = Array.from(new Set(eventParticipants.map(p => p.Event_ID)));

      // Step 3: Get Event details for those Event_IDs (to get dates and filter)
      // Batch to avoid IIS URL length limits
      const allEvents = await this.batchGetTableRecords<{
        Event_ID: number;
        Event_Start_Date: string;
      }>({
        table: 'Events',
        select: 'Event_ID,Event_Start_Date',
        ids: uniqueEventIds,
        idColumn: 'Event_ID',
        extraFilter: 'Cancelled = 0'
      });


      // Create a map of Event_ID to Event_Start_Date
      const eventDateMap = new Map(allEvents.map(e => [e.Event_ID, e.Event_Start_Date]));

      // Filter Event_Participants to only include events within date range and on Sundays
      const sundayParticipants = eventParticipants.filter(p => {
        const eventDate = eventDateMap.get(p.Event_ID);
        if (!eventDate) return false;

        const date = new Date(eventDate);

        // Check if within date range
        if (date < startDate || date > endDate) return false;

        // Check if Sunday (getDay() returns 0 for Sunday)
        return date.getDay() === 0;
      });

      if (sundayParticipants.length === 0) return { monthly: [], weekly: [] };

      // Step 4a: Group data by month and group (for monthly aggregation)
      const monthlyGroupData = new Map<string, Map<number, {
        participantIds: Set<number>;
        eventIds: Set<number>;
      }>>();

      // Step 4b: Group data by event date and group (for weekly aggregation)
      const weeklyGroupData = new Map<string, Map<number, {
        participantIds: Set<number>;
      }>>();

      for (const participant of sundayParticipants) {
        const eventDate = eventDateMap.get(participant.Event_ID);
        if (!eventDate) continue;

        const date = new Date(eventDate);
        const monthKey = date.toISOString().slice(0, 7); // "2025-09"
        const dateKey = date.toISOString().slice(0, 10); // "2025-09-07"

        // Monthly aggregation
        if (!monthlyGroupData.has(monthKey)) {
          monthlyGroupData.set(monthKey, new Map());
        }
        const monthData = monthlyGroupData.get(monthKey)!;
        if (!monthData.has(participant.Group_ID)) {
          monthData.set(participant.Group_ID, {
            participantIds: new Set(),
            eventIds: new Set()
          });
        }
        const monthGroupData = monthData.get(participant.Group_ID)!;
        monthGroupData.participantIds.add(participant.Event_Participant_ID);
        monthGroupData.eventIds.add(participant.Event_ID);

        // Weekly aggregation
        if (!weeklyGroupData.has(dateKey)) {
          weeklyGroupData.set(dateKey, new Map());
        }
        const weekData = weeklyGroupData.get(dateKey)!;
        if (!weekData.has(participant.Group_ID)) {
          weekData.set(participant.Group_ID, { participantIds: new Set() });
        }
        weekData.get(participant.Group_ID)!.participantIds.add(participant.Event_Participant_ID);
      }

      // Build monthly trends (averages)
      const monthly: CommunityAttendanceTrend[] = [];
      for (const [monthKey, groupsData] of Array.from(monthlyGroupData.entries()).sort()) {
        const communityAttendance: { [communityName: string]: number } = {};
        for (const [groupId, data] of groupsData) {
          const communityName = communityNameMap.get(groupId) || 'Unknown';
          const average = data.participantIds.size / data.eventIds.size;
          communityAttendance[communityName] = Math.round(average);
        }
        monthly.push({
          weekStartDate: monthKey + '-01',
          communityAttendance
        });
      }

      // Build weekly trends (per-date counts)
      const weekly: CommunityAttendanceTrend[] = [];
      for (const [dateKey, groupsData] of Array.from(weeklyGroupData.entries()).sort()) {
        const communityAttendance: { [communityName: string]: number } = {};
        for (const [groupId, data] of groupsData) {
          const communityName = communityNameMap.get(groupId) || 'Unknown';
          communityAttendance[communityName] = data.participantIds.size;
        }
        weekly.push({
          weekStartDate: dateKey,
          communityAttendance
        });
      }

      return { monthly, weekly };
    } catch (error) {
      console.error('Error fetching community attendance trends:', error);
      return { monthly: [], weekly: [] };
    }
  }

  /**
   * Gets monthly worship service attendance trends (September - August)
   *
   * @param startDate - Start date of period (September 1)
   * @param endDate - End date of period (August 31)
   * @returns Promise<MonthlyAttendanceTrend[]> - Monthly attendance data
   */
  private async getMonthlyAttendanceTrends(
    startDate: Date,
    endDate: Date
  ): Promise<MonthlyAttendanceTrend[]> {
    try {
      const trends: MonthlyAttendanceTrend[] = [];
      const currentDate = new Date(startDate);

      // Loop through each month in the ministry year (Sept - Aug)
      while (currentDate <= endDate) {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        const monthStartIso = monthStart.toISOString();
        const monthEndIso = monthEnd.toISOString();

        // Get worship service events for this month (Event_Type_ID = 7)
        const events = await this.mp!.getTableRecords<{
          Event_ID: number;
        }>({
          table: 'Events',
          select: 'Event_ID',
          filter: `
            Events.Event_Start_Date >= '${monthStartIso}' AND
            Events.Event_End_Date <= '${monthEndIso}' AND
            Events.Cancelled = 0 AND
            Events.Event_Type_ID = 7
          `
        });

        const eventIds = events.map(e => e.Event_ID);
        let totalInPerson = 0;
        let totalOnline = 0;
        let eventCount = 0;

        if (eventIds.length > 0) {
          // Get attendance metrics from Event_Metrics (Metric_ID 2 = In-Person, 3 = Online)
          const eventMetrics = await this.mp!.getTableRecords<{
            Event_ID: number;
            Metric_ID: number;
            Numerical_Value: number;
          }>({
            table: 'Event_Metrics',
            select: 'Event_ID,Metric_ID,Numerical_Value',
            filter: `
              Event_Metrics.Event_ID IN (${sanitizeIds(eventIds)}) AND
              Event_Metrics.Metric_ID IN (2, 3)
            `
          });

          // Track which events have metrics
          const eventsWithMetrics = new Set<number>();

          for (const metric of eventMetrics) {
            eventsWithMetrics.add(metric.Event_ID);

            if (metric.Metric_ID === 2) {
              // In-Person attendance
              totalInPerson += metric.Numerical_Value;
            } else if (metric.Metric_ID === 3) {
              // Online attendance
              totalOnline += metric.Numerical_Value;
            }
          }

          eventCount = eventsWithMetrics.size;
        }

        trends.push({
          month: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
          monthName: MONTH_NAMES[currentDate.getMonth()],
          averageInPersonAttendance: eventCount > 0 ? Math.round(totalInPerson / eventCount) : 0,
          averageOnlineAttendance: eventCount > 0 ? Math.round(totalOnline / eventCount) : 0,
          averageTotalAttendance: eventCount > 0 ? Math.round((totalInPerson + totalOnline) / eventCount) : 0,
          eventCount
        });

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      return trends;
    } catch (error) {
      console.error('Error fetching monthly attendance trends:', error);
      return [];
    }
  }

  /**
   * Gets per-event-date worship service attendance data
   * Used to show individual weekly data points when a single month is selected
   *
   * @param startDate - Start date of period
   * @param endDate - End date of period
   * @returns Promise<WeeklyAttendanceTrend[]> - Per-date attendance data sorted chronologically
   */
  private async getWeeklyAttendanceTrends(
    startDate: Date,
    endDate: Date
  ): Promise<WeeklyAttendanceTrend[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Fetch all worship service events with their dates
      const events = await this.mp!.getTableRecords<{
        Event_ID: number;
        Event_Start_Date: string;
      }>({
        table: 'Events',
        select: 'Event_ID,Event_Start_Date',
        filter: `
          Events.Event_Start_Date >= '${startIso}' AND
          Events.Event_End_Date <= '${endIso}' AND
          Events.Cancelled = 0 AND
          Events.Event_Type_ID = 7
        `
      });

      if (events.length === 0) return [];

      const eventIds = events.map(e => e.Event_ID);

      // Fetch all metrics for these events
      const eventMetrics = await this.mp!.getTableRecords<{
        Event_ID: number;
        Metric_ID: number;
        Numerical_Value: number;
      }>({
        table: 'Event_Metrics',
        select: 'Event_ID,Metric_ID,Numerical_Value',
        filter: `
          Event_Metrics.Event_ID IN (${sanitizeIds(eventIds)}) AND
          Event_Metrics.Metric_ID IN (2, 3)
        `
      });

      // Build event-to-date map
      const eventDateMap = new Map(events.map(e => [e.Event_ID, e.Event_Start_Date]));

      // Group metrics by date (YYYY-MM-DD)
      const dateGroups = new Map<string, {
        inPerson: number;
        online: number;
        eventIds: Set<number>;
      }>();

      for (const metric of eventMetrics) {
        const eventDate = eventDateMap.get(metric.Event_ID);
        if (!eventDate) continue;

        const dateKey = new Date(eventDate).toISOString().slice(0, 10);

        if (!dateGroups.has(dateKey)) {
          dateGroups.set(dateKey, { inPerson: 0, online: 0, eventIds: new Set() });
        }

        const group = dateGroups.get(dateKey)!;
        group.eventIds.add(metric.Event_ID);

        if (metric.Metric_ID === 2) {
          group.inPerson += metric.Numerical_Value;
        } else if (metric.Metric_ID === 3) {
          group.online += metric.Numerical_Value;
        }
      }

      // Convert to sorted array
      const trends: WeeklyAttendanceTrend[] = Array.from(dateGroups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, data]) => {
          const [year, month, day] = dateKey.split('-').map(Number);
          const date = new Date(year, month - 1, day);
          const dateLabel = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          });

          return {
            eventDate: dateKey,
            dateLabel,
            inPersonAttendance: data.inPerson,
            onlineAttendance: data.online,
            totalAttendance: data.inPerson + data.online,
            eventCount: data.eventIds.size
          };
        });

      return trends;
    } catch (error) {
      console.error('Error fetching weekly attendance trends:', error);
      return [];
    }
  }

  /**
   * Gets all Date_Accomplished values for a given Milestone_ID in the date range.
   * Returns ISO date strings so counts can be filtered client-side by selected period.
   */
  private async getMilestoneDates(milestoneId: number, startDate: Date, endDate: Date): Promise<string[]> {
    try {
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      const records = await this.mp!.getTableRecords<{ Date_Accomplished: string }>({
        table: 'Participant_Milestones',
        select: 'Date_Accomplished',
        filter: `Milestone_ID = ${milestoneId} AND Date_Accomplished >= '${startIso}' AND Date_Accomplished <= '${endIso}'`
      });

      return records.map(r => r.Date_Accomplished);
    } catch (error) {
      console.error(`Error fetching milestone dates for Milestone_ID=${milestoneId}:`, error);
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Know God: Unique Event Participants
  // ---------------------------------------------------------------

  private async getEventParticipantsByMonth(startDate: Date, endDate: Date): Promise<EventParticipantMonth[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Get events in the date range with their dates
      const events = await this.mp!.getTableRecords<{ Event_ID: number; Event_Start_Date: string }>({
        table: 'Events',
        select: 'Event_ID,Event_Start_Date',
        filter: `Event_Start_Date >= '${startIso}' AND Event_End_Date <= '${endIso}' AND Cancelled = 0`
      });

      if (events.length === 0) return [];

      // Get participants with status 3 or 4 (present)
      const eventParticipants = await this.batchGetTableRecords<{
        Event_ID: number;
        Participant_ID: number;
      }>({
        table: 'Event_Participants',
        select: 'Event_ID,Participant_ID',
        ids: events.map(e => e.Event_ID),
        idColumn: 'Event_ID',
        extraFilter: 'Participation_Status_ID IN (3, 4)'
      });

      // Build event → month map
      const eventMonthMap = new Map<number, string>();
      for (const e of events) {
        const d = new Date(e.Event_Start_Date);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        eventMonthMap.set(e.Event_ID, month);
      }

      // Group unique participant IDs by month
      const monthBuckets = new Map<string, Set<number>>();
      for (const ep of eventParticipants) {
        const month = eventMonthMap.get(ep.Event_ID);
        if (!month) continue;
        if (!monthBuckets.has(month)) monthBuckets.set(month, new Set());
        monthBuckets.get(month)!.add(ep.Participant_ID);
      }

      // Convert to array sorted by month
      return Array.from(monthBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, pids]) => ({ month, participantIds: [...pids] }));
    } catch (error) {
      console.error('Error fetching event participants by month:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Feed Your Soul: Roster vs Attendance
  // ---------------------------------------------------------------

  private async getRosterAndAttendanceRaw(startDate: Date, endDate: Date): Promise<{
    rosterMemberRecords: RosterMemberRecord[];
    attendanceByMonth: AttendanceMonthRecord[];
  }> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Get groups filtered by Group_Type_ID: 1 (Small Group), 3 (Class), 11 (Community)
      const relevantGroups = await this.mp!.getTableRecords<{
        Group_ID: number;
        Group_Type_ID: number;
      }>({
        table: 'Groups',
        select: 'Group_ID,Group_Type_ID',
        filter: `Group_Type_ID IN (1, 3, 11) AND Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
      });

      if (relevantGroups.length === 0) return { rosterMemberRecords: [], attendanceByMonth: [] };

      const groupTypeIds = new Set(relevantGroups.map(g => g.Group_Type_ID));
      const groupTypes = await this.getGroupTypesWithCache(groupTypeIds);

      const groupTypeMap = new Map(groupTypes.map(gt => [gt.Group_Type_ID, gt.Group_Type]));
      const groupToTypeMap = new Map(relevantGroups.map(g => [g.Group_ID, g.Group_Type_ID]));
      const relevantGroupIds = relevantGroups.map(g => g.Group_ID);

      // Roster: Group_Participants with their date ranges (no period filter — client will filter)
      const rosterParticipants = await this.batchGetTableRecords<{
        Group_ID: number;
        Participant_ID: number;
        Start_Date: string;
        End_Date: string | null;
      }>({
        table: 'Group_Participants',
        select: 'Group_ID,Participant_ID,Start_Date,End_Date',
        ids: relevantGroupIds,
        idColumn: 'Group_ID',
      });

      // Attendance: Event_Participants with event dates
      const allEventParticipants = await this.batchGetTableRecords<{
        Event_ID: number;
        Group_ID: number;
        Participant_ID: number;
      }>({
        table: 'Event_Participants',
        select: 'Event_ID,Group_ID,Participant_ID',
        ids: relevantGroupIds,
        idColumn: 'Group_ID',
        extraFilter: 'Participation_Status_ID IN (3, 4)'
      });

      // Look up Event dates for attendance records
      const uniqueEventIds = [...new Set(allEventParticipants.map(p => p.Event_ID))];
      const eventDateMap = new Map<number, string>();

      if (uniqueEventIds.length > 0) {
        const events = await this.batchGetTableRecords<{
          Event_ID: number;
          Event_Start_Date: string;
        }>({
          table: 'Events',
          select: 'Event_ID,Event_Start_Date',
          ids: uniqueEventIds,
          idColumn: 'Event_ID'
        });
        for (const e of events) eventDateMap.set(e.Event_ID, e.Event_Start_Date);
      }

      // Resolve Participant_ID → Contact_ID
      const allParticipantIds = new Set<number>();
      for (const gp of rosterParticipants) allParticipantIds.add(gp.Participant_ID);
      for (const ep of allEventParticipants) allParticipantIds.add(ep.Participant_ID);

      const contactLookup = await this.batchGetTableRecords<{
        Participant_ID: number;
        Contact_ID: number;
      }>({
        table: 'Participants',
        select: 'Participant_ID,Contact_ID',
        ids: [...allParticipantIds],
        idColumn: 'Participant_ID'
      });
      const contactMap = new Map(contactLookup.map(c => [c.Participant_ID, c.Contact_ID]));

      // Build roster member records (unique contactId + groupType + date range)
      const rosterDedup = new Map<string, RosterMemberRecord>();
      for (const gp of rosterParticipants) {
        const typeId = groupToTypeMap.get(gp.Group_ID);
        const contactId = contactMap.get(gp.Participant_ID);
        if (!typeId || !contactId) continue;
        const key = `${contactId}-${typeId}`;
        const existing = rosterDedup.get(key);
        // Keep the record with the earliest start date for this contact+type
        if (!existing || gp.Start_Date < existing.startDate) {
          rosterDedup.set(key, {
            contactId,
            groupTypeId: typeId,
            groupTypeName: groupTypeMap.get(typeId) || 'Unknown',
            startDate: gp.Start_Date,
            endDate: gp.End_Date,
          });
        } else if (existing && gp.End_Date === null) {
          // If any record has no end date, the person is still active
          existing.endDate = null;
        }
      }

      // Build attendance by month + group type (unique contact IDs per bucket)
      const attendanceBuckets = new Map<string, { groupTypeId: number; groupTypeName: string; contacts: Set<number> }>();
      for (const ep of allEventParticipants) {
        const eventDate = eventDateMap.get(ep.Event_ID);
        if (!eventDate) continue;
        const typeId = groupToTypeMap.get(ep.Group_ID);
        const contactId = contactMap.get(ep.Participant_ID);
        if (!typeId || !contactId) continue;

        const d = new Date(eventDate);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bucketKey = `${month}-${typeId}`;

        if (!attendanceBuckets.has(bucketKey)) {
          attendanceBuckets.set(bucketKey, {
            groupTypeId: typeId,
            groupTypeName: groupTypeMap.get(typeId) || 'Unknown',
            contacts: new Set(),
          });
        }
        attendanceBuckets.get(bucketKey)!.contacts.add(contactId);
      }

      const attendanceByMonth: AttendanceMonthRecord[] = Array.from(attendanceBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, bucket]) => ({
          month: key.substring(0, 7), // YYYY-MM
          groupTypeId: bucket.groupTypeId,
          groupTypeName: bucket.groupTypeName,
          contactIds: [...bucket.contacts],
        }));

      return {
        rosterMemberRecords: [...rosterDedup.values()],
        attendanceByMonth,
      };
    } catch (error) {
      console.error('Error fetching roster and attendance raw data:', error);
      return { rosterMemberRecords: [], attendanceByMonth: [] };
    }
  }

  // ---------------------------------------------------------------
  // Grow in Love: Serving/Leading raw records
  // ---------------------------------------------------------------

  /**
   * Gets serving/leading records enriched with role type names and ministry names.
   * Single API call chain replaces 4 separate methods that each called getServingLeadingParticipants.
   * Returns raw records for client-side date filtering and aggregation.
   */
  private async getServingLeadingRaw(startDate: Date, endDate: Date): Promise<ServingLeadingRecord[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Step 1: Get all Group_Roles that are serving (type 3) or leading (type 1)
      const servingRoles = await this.mp!.getTableRecords<{
        Group_Role_ID: number;
        Group_Role_Type_ID: number;
        Ministry_ID: number | null;
      }>({
        table: 'Group_Roles',
        select: 'Group_Role_ID,Group_Role_Type_ID,Ministry_ID',
        filter: 'Group_Role_Type_ID IN (1, 3)'
      });

      if (servingRoles.length === 0) return [];

      const servingRoleIds = servingRoles.map(r => r.Group_Role_ID);
      const roleTypeMap = new Map(servingRoles.map(r => [r.Group_Role_ID, r.Group_Role_Type_ID]));
      const roleMinistryMap = new Map(servingRoles.map(r => [r.Group_Role_ID, r.Ministry_ID]));

      // Step 2: Get Group_Participants with those roles, active during the period
      const participants = await this.batchGetTableRecords<{
        Participant_ID: number;
        Group_Role_ID: number;
        Start_Date: string;
        End_Date: string | null;
      }>({
        table: 'Group_Participants',
        select: 'Participant_ID,Group_Role_ID,Start_Date,End_Date',
        ids: servingRoleIds,
        idColumn: 'Group_Role_ID',
        extraFilter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
      });

      if (participants.length === 0) return [];

      // Step 3: Resolve Participant → Contact
      const participantIds = [...new Set(participants.map(p => p.Participant_ID))];
      const contactLookup = await this.batchGetTableRecords<{
        Participant_ID: number;
        Contact_ID: number;
      }>({
        table: 'Participants',
        select: 'Participant_ID,Contact_ID',
        ids: participantIds,
        idColumn: 'Participant_ID'
      });
      const contactMap = new Map(contactLookup.map(c => [c.Participant_ID, c.Contact_ID]));

      // Step 4: Get role type display names
      const roleTypes = await this.mp!.getTableRecords<{
        Group_Role_Type_ID: number;
        Group_Role_Type: string;
      }>({
        table: 'Group_Role_Types',
        select: 'Group_Role_Type_ID,Group_Role_Type',
        filter: 'Group_Role_Type_ID IN (1, 3)'
      });
      const roleTypeNameMap = new Map(roleTypes.map(rt => [rt.Group_Role_Type_ID, rt.Group_Role_Type]));

      // Step 5: Get Ministry names for all unique Ministry_IDs
      const ministryIds = [...new Set(
        servingRoles.map(r => r.Ministry_ID).filter((id): id is number => id !== null)
      )];
      const ministryNameMap = new Map<number, string>();
      if (ministryIds.length > 0) {
        const ministries = await this.batchGetTableRecords<{
          Ministry_ID: number;
          Ministry_Name: string;
        }>({
          table: 'Ministries',
          select: 'Ministry_ID,Ministry_Name',
          ids: ministryIds,
          idColumn: 'Ministry_ID'
        });
        for (const m of ministries) ministryNameMap.set(m.Ministry_ID, m.Ministry_Name);
      }

      // Step 6: Build records, deduplicate per (contactId, roleTypeId, ministryId)
      const dedup = new Map<string, ServingLeadingRecord>();
      for (const p of participants) {
        const contactId = contactMap.get(p.Participant_ID);
        if (!contactId) continue;

        const roleTypeId = roleTypeMap.get(p.Group_Role_ID) || 0;
        const ministryId = roleMinistryMap.get(p.Group_Role_ID) ?? null;
        const key = `${contactId}-${roleTypeId}-${ministryId}`;

        const existing = dedup.get(key);
        if (!existing || p.Start_Date < existing.startDate) {
          dedup.set(key, {
            contactId,
            roleTypeId,
            roleTypeName: roleTypeNameMap.get(roleTypeId) || (roleTypeId === 1 ? 'Leader' : 'Servant'),
            ministryId,
            ministryName: ministryId ? (ministryNameMap.get(ministryId) || 'Unknown') : null,
            startDate: p.Start_Date,
            endDate: p.End_Date,
          });
        } else if (existing && p.End_Date === null) {
          // If any record has no end date, the person is still active
          existing.endDate = null;
        }
      }

      return [...dedup.values()];
    } catch (error) {
      console.error('Error fetching serving/leading raw records:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Engagement Venn Diagram: raw data for client-side computation
  // ---------------------------------------------------------------

  /**
   * Gets raw engagement data for the venn diagram.
   * Three dimensions: Activity (Activity_Log), Groups (Ministry_ID=8), Serving (contact IDs).
   * All data is bucketed/dated so client can filter by selected date range.
   * Adult filter is pre-computed once and stored for client-side intersection.
   * Self-contained: fetches serving contact IDs internally for the adult filter.
   */
  private async getEngagementRawData(
    startDate: Date,
    endDate: Date,
  ): Promise<EngagementRawData> {
    const empty: EngagementRawData = { activityByMonth: [], groupRecords: [], adultContactIds: [] };
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Step 1: Activity — query Activity_Log, bucket by month
      const activityRecords = await this.mp!.getTableRecords<{
        Contact_ID: number;
        Activity_Date: string;
      }>({
        table: 'Activity_Log',
        select: 'Contact_ID,Activity_Date',
        filter: `Activity_Date >= '${startIso}' AND Activity_Date <= '${endIso}'`,
      });

      const activityBuckets = new Map<string, Set<number>>();
      for (const r of activityRecords) {
        const d = new Date(r.Activity_Date);
        const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!activityBuckets.has(month)) activityBuckets.set(month, new Set());
        activityBuckets.get(month)!.add(r.Contact_ID);
      }
      const activityByMonth = Array.from(activityBuckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, contacts]) => ({ month, contactIds: [...contacts] }));

      // Step 2: Groups — Ministry_ID=8, with date ranges for client-side filtering
      const groups = await this.mp!.getTableRecords<{ Group_ID: number }>({
        table: 'Groups',
        select: 'Group_ID',
        filter: `Ministry_ID = 8 AND Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
      });

      let groupRecords: EngagementRawData['groupRecords'] = [];
      if (groups.length > 0) {
        const groupIds = groups.map(g => g.Group_ID);
        const participants = await this.batchGetTableRecords<{
          Participant_ID: number;
          Start_Date: string;
          End_Date: string | null;
        }>({
          table: 'Group_Participants',
          select: 'Participant_ID,Start_Date,End_Date',
          ids: groupIds,
          idColumn: 'Group_ID',
          extraFilter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
        });

        // Resolve Participant → Contact
        const participantIds = [...new Set(participants.map(p => p.Participant_ID))];
        if (participantIds.length > 0) {
          const contacts = await this.batchGetTableRecords<{
            Participant_ID: number;
            Contact_ID: number;
          }>({
            table: 'Participants',
            select: 'Participant_ID,Contact_ID',
            ids: participantIds,
            idColumn: 'Participant_ID'
          });
          const contactMap = new Map(contacts.map(c => [c.Participant_ID, c.Contact_ID]));

          // Deduplicate per contact (keep earliest start, null end if any null)
          const dedup = new Map<number, { startDate: string; endDate: string | null }>();
          for (const p of participants) {
            const contactId = contactMap.get(p.Participant_ID);
            if (!contactId) continue;
            const existing = dedup.get(contactId);
            if (!existing || p.Start_Date < existing.startDate) {
              dedup.set(contactId, { startDate: p.Start_Date, endDate: p.End_Date });
            } else if (existing && p.End_Date === null) {
              existing.endDate = null;
            }
          }

          groupRecords = Array.from(dedup.entries()).map(([contactId, dates]) => ({
            contactId,
            startDate: dates.startDate,
            endDate: dates.endDate,
          }));
        }
      }

      // Step 3: Get serving contact IDs (lightweight — just need IDs for adult filter)
      const servingContactIds = await this.getServingContactIds(startIso, endIso);

      // Step 4: Adult filter — collect all contact IDs, filter to adults once
      const allContactIds = new Set<number>();
      for (const bucket of activityByMonth) {
        for (const id of bucket.contactIds) allContactIds.add(id);
      }
      for (const r of groupRecords) allContactIds.add(r.contactId);
      for (const id of servingContactIds) allContactIds.add(id);

      const adultSet = await this.filterAdultContacts(allContactIds);

      // Filter activity and group data to adults only
      const adultActivityByMonth = activityByMonth.map(bucket => ({
        month: bucket.month,
        contactIds: bucket.contactIds.filter(id => adultSet.has(id)),
      }));
      const adultGroupRecords = groupRecords.filter(r => adultSet.has(r.contactId));

      return {
        activityByMonth: adultActivityByMonth,
        groupRecords: adultGroupRecords,
        adultContactIds: [...adultSet],
      };
    } catch (error) {
      console.error('Error fetching engagement raw data:', error);
      return empty;
    }
  }

  /**
   * Lightweight query to get unique Contact_IDs of people in serving/leading roles.
   * Used by getEngagementRawData for the adult filter without needing full enriched records.
   */
  private async getServingContactIds(startIso: string, endIso: string): Promise<Set<number>> {
    try {
      // Get serving/leading role IDs
      const servingRoles = await this.mp!.getTableRecords<{ Group_Role_ID: number }>({
        table: 'Group_Roles',
        select: 'Group_Role_ID',
        filter: 'Group_Role_Type_ID IN (1, 3)'
      });
      if (servingRoles.length === 0) return new Set();

      // Get participants with those roles, active in range
      const participants = await this.batchGetTableRecords<{ Participant_ID: number }>({
        table: 'Group_Participants',
        select: 'Participant_ID',
        ids: servingRoles.map(r => r.Group_Role_ID),
        idColumn: 'Group_Role_ID',
        extraFilter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
      });
      if (participants.length === 0) return new Set();

      // Resolve to Contact_IDs
      const participantIds = [...new Set(participants.map(p => p.Participant_ID))];
      const contacts = await this.batchGetTableRecords<{ Participant_ID: number; Contact_ID: number }>({
        table: 'Participants',
        select: 'Participant_ID,Contact_ID',
        ids: participantIds,
        idColumn: 'Participant_ID'
      });

      return new Set(contacts.map(c => c.Contact_ID));
    } catch (error) {
      console.error('Error fetching serving contact IDs:', error);
      return new Set();
    }
  }

  /** Filter a set of Contact_IDs to only include adults (age >= 18 or Date_of_Birth is null) */
  private async filterAdultContacts(contactIds: Set<number>): Promise<Set<number>> {
    if (contactIds.size === 0) return new Set();

    const contacts = await this.batchGetTableRecords<{ Contact_ID: number; Date_of_Birth: string | null }>({
      table: 'Contacts',
      select: 'Contact_ID,Date_of_Birth',
      ids: [...contactIds],
      idColumn: 'Contact_ID',
    });

    const today = new Date();
    return new Set(
      contacts
        .filter(c => {
          if (!c.Date_of_Birth) return true;
          const dob = new Date(c.Date_of_Birth);
          const age = today.getFullYear() - dob.getFullYear()
            - (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
          return age >= 18;
        })
        .map(c => c.Contact_ID)
    );
  }
}
