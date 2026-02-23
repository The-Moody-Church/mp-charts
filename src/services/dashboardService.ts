import { cacheLife, cacheTag } from 'next/cache';
import { MPHelper } from '@/lib/providers/ministry-platform';
import {
  DashboardData,
  GroupTypeMetrics,
  EventTypeMetrics,
  PeriodMetrics,
  YearOverYearMetrics,
  SmallGroupTrend,
  MonthlyAttendanceTrend,
  WeeklyAttendanceTrend,
  CommunityAttendanceTrend,
  ServingTrend,
  ServingByRoleType,
  ServingByMinistry,
  EngagementOverlap,
  RosterVsAttendance,
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
    filter: `Group_Type_ID IN (${ids})`
  });
}

/**
 * Cached Event_Types lookup (24-hour cache via 'use cache')
 * The `ids` parameter is automatically part of the cache key.
 */
async function getCachedEventTypes(ids: string) {
  'use cache';
  cacheLife({ revalidate: 86400 });
  cacheTag('event-types');

  const mp = new MPHelper();
  return mp.getTableRecords<{
    Event_Type_ID: number;
    Event_Type: string;
  }>({
    table: 'Event_Types',
    select: 'Event_Type_ID,Event_Type',
    filter: `Event_Type_ID IN (${ids})`
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
   * Gets Event_Types with 24-hour cache via 'use cache'
   */
  private async getEventTypesWithCache(eventTypeIds: Set<number>) {
    const ids = Array.from(eventTypeIds).sort().join(',');
    return getCachedEventTypes(ids);
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
      const filter = extraFilter
        ? `${idColumn} IN (${batchIds.join(',')}) AND ${extraFilter}`
        : `${idColumn} IN (${batchIds.join(',')})`;
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

    // Calculate baptisms date ranges (last 365 days from today)
    const today = new Date();
    const currentBaptismsStart = new Date(today);
    currentBaptismsStart.setFullYear(today.getFullYear() - 1);
    const previousBaptismsEnd = new Date(currentBaptismsStart);
    previousBaptismsEnd.setDate(previousBaptismsEnd.getDate() - 1);
    const previousBaptismsStart = new Date(previousBaptismsEnd);
    previousBaptismsStart.setFullYear(previousBaptismsEnd.getFullYear() - 1);

    // Engagement overlap and snapshot metrics use last 12 months only
    // (these are too heavy for the full 5-year range and are snapshot-style data)
    const snapshotStart = new Date(today);
    snapshotStart.setFullYear(today.getFullYear() - 1);
    const snapshotEnd = today;

    // Fetch all metrics in parallel for better performance
    const [
      currentPeriod,
      previousPeriod,
      groupTypeMetrics,
      eventTypeMetrics,
      smallGroupTrends,
      communityTrends,
      monthlyAttendanceTrends,
      previousYearMonthlyAttendanceTrends,
      weeklyAttendanceTrends,
      baptismsLastYear,
      baptismsPreviousYear,
      membershipCount,
      membershipPreviousCount,
      uniqueEventParticipants,
      rosterVsAttendance,
      servingTrends,
      servingByRoleType,
      servingByMinistry,
      totalServingLeading,
      engagementOverlap,
    ] = await Promise.all([
      this.getPeriodMetrics(currentYearStart, currentYearEnd),
      this.getPeriodMetrics(previousYearStart, previousYearEnd),
      this.getGroupTypeMetrics(currentYearStart, currentYearEnd),
      this.getEventTypeMetrics(currentYearStart, currentYearEnd),
      this.getSmallGroupTrends(currentYearStart, currentYearEnd),
      this.getCommunityAttendanceTrends(currentYearStart, currentYearEnd),
      this.getMonthlyAttendanceTrends(currentYearStart, currentYearEnd),
      this.getMonthlyAttendanceTrends(previousYearStart, previousYearEnd),
      this.getWeeklyAttendanceTrends(currentYearStart, currentYearEnd),
      this.getBaptismsCount(currentBaptismsStart, today),
      this.getBaptismsCount(previousBaptismsStart, previousBaptismsEnd),
      this.getMembershipCount(currentBaptismsStart, today),
      this.getMembershipCount(previousBaptismsStart, previousBaptismsEnd),
      this.getUniqueEventParticipants(currentYearStart, currentYearEnd),
      this.getRosterVsAttendance(snapshotStart, snapshotEnd),
      this.getServingTrends(currentYearStart, currentYearEnd),
      this.getServingByRoleType(snapshotStart, snapshotEnd),
      this.getServingByMinistry(snapshotStart, snapshotEnd),
      this.getTotalServingLeading(snapshotStart, snapshotEnd),
      this.getEngagementOverlap(snapshotStart, snapshotEnd),
    ]);

    // Calculate year-over-year comparisons
    const yearOverYear = this.calculateYearOverYear(
      currentPeriod,
      previousPeriod,
      groupTypeMetrics,
      eventTypeMetrics
    );

    return {
      currentPeriod,
      previousPeriod,
      groupTypeMetrics,
      eventTypeMetrics,
      yearOverYear,
      smallGroupTrends,
      previousYearSmallGroupTrends: [], // Computed client-side by filterDashboardData
      communityAttendanceTrends: communityTrends.monthly,
      monthlyAttendanceTrends,
      previousYearMonthlyAttendanceTrends,
      weeklyAttendanceTrends,
      weeklyCommunityAttendanceTrends: communityTrends.weekly,
      baptismsLastYear,
      baptismsPreviousYear,
      membershipCount,
      membershipPreviousCount,
      uniqueEventParticipants,
      rosterVsAttendance,
      servingTrends,
      servingByRoleType,
      servingByMinistry,
      totalServingLeading,
      givingByProgram: [],
      givingTrends: [],
      engagementOverlap,
      generatedAt: new Date().toISOString()
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
      }>({
        table: 'Groups',
        select: 'Group_ID,Group_Type_ID',
        filter: `
          Groups.Start_Date <= '${endIso}' AND
          (Groups.End_Date IS NULL OR Groups.End_Date >= '${startIso}')
        `
      });

      if (groups.length === 0) return [];

      // Step 2: Get all group types to identify which to exclude (cached 24 hours)
      const groupTypeIds = new Set(groups.map(g => g.Group_Type_ID));
      const groupTypes = await this.getGroupTypesWithCache(groupTypeIds);

      // Identify childcare group type IDs
      const childcareTypeIds = new Set(
        groupTypes
          .filter(gt => gt.Group_Type === 'Childcare')
          .map(gt => gt.Group_Type_ID)
      );

      // Filter out childcare groups
      const filteredGroups = groups.filter(g => !childcareTypeIds.has(g.Group_Type_ID));
      const activeGroupIds = new Set(filteredGroups.map(g => g.Group_ID));
      if (activeGroupIds.size === 0) return [];

      // Filter out childcare from group types
      const filteredGroupTypes = groupTypes.filter(gt => gt.Group_Type !== 'Childcare');
      const groupTypeMap = new Map(filteredGroupTypes.map(gt => [gt.Group_Type_ID, gt.Group_Type]));
      const groupToTypeMap = new Map(filteredGroups.map(g => [g.Group_ID, g.Group_Type_ID]));

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
   * Gets event attendance metrics by event type
   *
   * @param startDate - Start date of period
   * @param endDate - End date of period
   * @returns Promise<EventTypeMetrics[]> - Event metrics by type
   */
  private async getEventTypeMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<EventTypeMetrics[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Step 1: Get events for the period (Event_Type_ID = 7 for Worship Services)
      const events = await this.mp!.getTableRecords<{
        Event_ID: number;
        Event_Type_ID: number;
      }>({
        table: 'Events',
        select: 'Event_ID,Event_Type_ID',
        filter: `
          Events.Event_Start_Date >= '${startIso}' AND
          Events.Event_End_Date <= '${endIso}' AND
          Events.Cancelled = 0 AND
          Events.Event_Type_ID = 7
        `
      });

      const eventIds = new Set(events.map(e => e.Event_ID));
      if (eventIds.size === 0) return [];

      // Step 2: Get event types (cached 24 hours)
      const eventTypeIds = new Set(events.map(e => e.Event_Type_ID));
      const eventTypes = await this.getEventTypesWithCache(eventTypeIds);

      const eventTypeMap = new Map(eventTypes.map(et => [et.Event_Type_ID, et.Event_Type]));
      const eventToTypeMap = new Map(events.map(e => [e.Event_ID, e.Event_Type_ID]));

      // Step 3: Get attendance metrics from Event_Metrics (Metric_ID 2 = In-Person, 3 = Online)
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

      // Aggregate by event type with online vs in-person breakdown
      const metricsMap = new Map<number, {
        eventTypeName: string;
        eventIds: Set<number>;
        totalAttendance: number;
        inPersonAttendance: number;
        onlineAttendance: number;
      }>();

      for (const metric of eventMetrics) {
        const eventTypeId = eventToTypeMap.get(metric.Event_ID);
        if (!eventTypeId) continue;

        const eventTypeName = eventTypeMap.get(eventTypeId) || 'Unknown';

        if (!metricsMap.has(eventTypeId)) {
          metricsMap.set(eventTypeId, {
            eventTypeName,
            eventIds: new Set(),
            totalAttendance: 0,
            inPersonAttendance: 0,
            onlineAttendance: 0
          });
        }

        const metrics = metricsMap.get(eventTypeId)!;
        metrics.eventIds.add(metric.Event_ID);

        if (metric.Metric_ID === 2) {
          // In-Person attendance
          metrics.inPersonAttendance += metric.Numerical_Value;
          metrics.totalAttendance += metric.Numerical_Value;
        } else if (metric.Metric_ID === 3) {
          // Online attendance
          metrics.onlineAttendance += metric.Numerical_Value;
          metrics.totalAttendance += metric.Numerical_Value;
        }
      }

      // Convert to array format
      return Array.from(metricsMap.entries()).map(([eventTypeId, metrics]) => ({
        eventTypeId,
        eventTypeName: metrics.eventTypeName,
        eventCount: metrics.eventIds.size,
        totalAttendance: metrics.totalAttendance,
        totalInPersonAttendance: metrics.inPersonAttendance,
        totalOnlineAttendance: metrics.onlineAttendance,
        // Event_Metrics doesn't track individual participants, only headcounts
        uniqueAttendees: 0,
        uniqueInPersonAttendees: 0,
        uniqueOnlineAttendees: 0,
        averageAttendance: metrics.eventIds.size > 0
          ? Math.round(metrics.totalAttendance / metrics.eventIds.size)
          : 0,
        averageInPersonAttendance: metrics.eventIds.size > 0
          ? Math.round(metrics.inPersonAttendance / metrics.eventIds.size)
          : 0,
        averageOnlineAttendance: metrics.eventIds.size > 0
          ? Math.round(metrics.onlineAttendance / metrics.eventIds.size)
          : 0
      }));
    } catch (error) {
      console.error('Error fetching event type metrics:', error);
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
          uniqueAttendees: 0,
          uniqueInPersonAttendees: 0,
          uniqueOnlineAttendees: 0,
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
        // Note: Event_Metrics doesn't track individual participants, only headcounts
        uniqueAttendees: 0,
        uniqueInPersonAttendees: 0,
        uniqueOnlineAttendees: 0
      };
    } catch (error) {
      console.error('Error fetching period metrics:', error);
      return {
        periodStart: startIso,
        periodEnd: endIso,
        averageAttendance: 0,
        averageInPersonAttendance: 0,
        averageOnlineAttendance: 0,
        uniqueAttendees: 0,
        uniqueInPersonAttendees: 0,
        uniqueOnlineAttendees: 0,
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
      // Step 1: Get all active groups for the entire period (1 query)
      const groups = await this.mp!.getTableRecords<{
        Group_ID: number;
        Group_Type_ID: number;
        Start_Date: string;
        End_Date: string | null;
      }>({
        table: 'Groups',
        select: 'Group_ID,Group_Type_ID,Start_Date,End_Date',
        filter: `
          Groups.Start_Date <= '${endIso}' AND
          (Groups.End_Date IS NULL OR Groups.End_Date >= '${startIso}')
        `
      });

      if (groups.length === 0) return [];

      // Step 2: Get all group types to identify small groups (cached 24 hours)
      const groupTypeIds = new Set(groups.map(g => g.Group_Type_ID));
      const groupTypes = await this.getGroupTypesWithCache(groupTypeIds);

      // Filter for small groups and create lookup maps
      const smallGroupTypeIds = new Set(
        groupTypes
          .filter(gt =>
            gt.Group_Type.toLowerCase().includes('small') ||
            gt.Group_Type.toLowerCase().includes('life') ||
            gt.Group_Type.toLowerCase().includes('community')
          )
          .map(gt => gt.Group_Type_ID)
      );

      const smallGroups = groups.filter(g => smallGroupTypeIds.has(g.Group_Type_ID));
      const smallGroupIds = new Set(smallGroups.map(g => g.Group_ID));

      if (smallGroupIds.size === 0) return [];

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
          Group_Participants.Group_ID IN (${Array.from(smallGroupIds).join(',')}) AND
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
        console.log('No Community groups found (Group_Type_ID = 11)');
        return { monthly: [], weekly: [] };
      }

      const communityGroupIds = communityGroups.map(g => g.Group_ID);
      const communityNameMap = new Map(communityGroups.map(g => [g.Group_ID, g.Group_Name]));

      console.log(`Found ${communityGroups.length} Community groups`);

      // Step 2: Get Event_Participants for community groups with status 3 or 4 (Present)
      const eventParticipants = await this.mp!.getTableRecords<{
        Event_Participant_ID: number;
        Event_ID: number;
        Group_ID: number;
        Participation_Status_ID: number;
      }>({
        table: 'Event_Participants',
        select: 'Event_Participant_ID,Event_ID,Group_ID,Participation_Status_ID',
        filter: `Event_Participants.Group_ID IN (${communityGroupIds.join(',')}) AND Event_Participants.Participation_Status_ID IN (3, 4)`
      });

      console.log(`Found ${eventParticipants.length} event participants for community groups`);

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

      console.log(`Found ${allEvents.length} events`);

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

      console.log(`After filtering to Sundays in date range: ${sundayParticipants.length} participants`);

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

      console.log(`Returning ${monthly.length} monthly and ${weekly.length} weekly trends`);
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
              Event_Metrics.Event_ID IN (${eventIds.join(',')}) AND
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
          Event_Metrics.Event_ID IN (${eventIds.join(',')}) AND
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
   * Gets the count of baptisms for a specific date range
   * Queries Participant_Milestones for records where:
   * - Milestone_ID = 3 (Baptism)
   * - Date_Accomplished is within the specified date range
   *
   * @param startDate - Start date of the period (365 days ago from reference date)
   * @param endDate - End date of the period (reference date, typically today)
   * @returns Promise<number> - Count of baptisms in the specified period
   */
  private async getBaptismsCount(startDate: Date, endDate: Date): Promise<number> {
    try {
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      // Query Participant_Milestones for baptisms (Milestone_ID = 3) in the date range
      const participantMilestones = await this.mp!.getTableRecords<{
        Participant_Milestone_ID: number;
      }>({
        table: 'Participant_Milestones',
        select: 'Participant_Milestone_ID',
        filter: `
          Participant_Milestones.Milestone_ID = 3 AND
          Participant_Milestones.Date_Accomplished >= '${startIso}' AND
          Participant_Milestones.Date_Accomplished <= '${endIso}'
        `
      });

      console.log(`Found ${participantMilestones.length} baptisms between ${startDate.toISOString().split('T')[0]} and ${endDate.toISOString().split('T')[0]}`);
      return participantMilestones.length;
    } catch (error) {
      console.error('Error fetching baptisms count:', error);
      return 0;
    }
  }

  /**
   * Calculate year-over-year comparison metrics
   *
   * @param current - Current period metrics
   * @param previous - Previous period metrics
   * @param currentGroups - Current group type metrics
   * @param currentEvents - Current event type metrics
   * @returns YearOverYearMetrics[] - Year-over-year comparisons
   */
  private calculateYearOverYear(
    current: PeriodMetrics,
    previous: PeriodMetrics,
    currentGroups: GroupTypeMetrics[],
    currentEvents: EventTypeMetrics[]
  ): YearOverYearMetrics[] {
    const metrics: YearOverYearMetrics[] = [];

    // Overall attendance YoY
    metrics.push({
      metric: 'Average Attendance',
      currentYear: current.averageAttendance,
      previousYear: previous.averageAttendance,
      percentageChange: this.calculatePercentChange(current.averageAttendance, previous.averageAttendance),
      trend: this.determineTrend(current.averageAttendance, previous.averageAttendance)
    });

    metrics.push({
      metric: 'Unique Attendees',
      currentYear: current.uniqueAttendees,
      previousYear: previous.uniqueAttendees,
      percentageChange: this.calculatePercentChange(current.uniqueAttendees, previous.uniqueAttendees),
      trend: this.determineTrend(current.uniqueAttendees, previous.uniqueAttendees)
    });

    // Total events YoY
    metrics.push({
      metric: 'Total Events',
      currentYear: current.totalEvents,
      previousYear: previous.totalEvents,
      percentageChange: this.calculatePercentChange(current.totalEvents, previous.totalEvents),
      trend: this.determineTrend(current.totalEvents, previous.totalEvents)
    });

    // Active groups YoY
    const currentGroupCount = currentGroups.reduce((sum, g) => sum + g.activeGroupCount, 0);
    const currentParticipants = currentGroups.reduce((sum, g) => sum + g.uniqueParticipants, 0);
    const currentEventTypes = currentEvents.length;

    metrics.push({
      metric: 'Active Groups',
      currentYear: currentGroupCount,
      previousYear: 0, // Would need to query previous year groups
      percentageChange: 0,
      trend: 'stable'
    });

    metrics.push({
      metric: 'Group Participants',
      currentYear: currentParticipants,
      previousYear: 0, // Would need to query previous year groups
      percentageChange: 0,
      trend: 'stable'
    });

    metrics.push({
      metric: 'Event Types Active',
      currentYear: currentEventTypes,
      previousYear: 0, // Would need to query previous year events
      percentageChange: 0,
      trend: 'stable'
    });

    return metrics;
  }

  /**
   * Calculate percentage change between two values
   *
   * @param current - Current value
   * @param previous - Previous value
   * @returns number - Percentage change
   */
  private calculatePercentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  /**
   * Determine trend direction
   *
   * @param current - Current value
   * @param previous - Previous value
   * @returns 'up' | 'down' | 'stable' - Trend direction
   */
  private determineTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
    const change = this.calculatePercentChange(current, previous);
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'up' : 'down';
  }

  // ---------------------------------------------------------------
  // Know God: Membership count (Milestone 48 net of Milestone 49)
  // ---------------------------------------------------------------

  private async getMembershipCount(startDate: Date, endDate: Date): Promise<number> {
    try {
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      // Milestone 48 = Registered Member, Milestone 49 = Dropped Membership
      const [registered, dropped] = await Promise.all([
        this.mp!.getTableRecords<{ Participant_Milestone_ID: number }>({
          table: 'Participant_Milestones',
          select: 'Participant_Milestone_ID',
          filter: `Milestone_ID = 48 AND Date_Accomplished >= '${startIso}' AND Date_Accomplished <= '${endIso}'`
        }),
        this.mp!.getTableRecords<{ Participant_Milestone_ID: number }>({
          table: 'Participant_Milestones',
          select: 'Participant_Milestone_ID',
          filter: `Milestone_ID = 49 AND Date_Accomplished >= '${startIso}' AND Date_Accomplished <= '${endIso}'`
        }),
      ]);

      return registered.length - dropped.length;
    } catch (error) {
      console.error('Error fetching membership count:', error);
      return 0;
    }
  }

  // ---------------------------------------------------------------
  // Know God: Unique Event Participants
  // ---------------------------------------------------------------

  private async getUniqueEventParticipants(startDate: Date, endDate: Date): Promise<number> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Get events in the date range
      const events = await this.mp!.getTableRecords<{ Event_ID: number }>({
        table: 'Events',
        select: 'Event_ID',
        filter: `Event_Start_Date >= '${startIso}' AND Event_End_Date <= '${endIso}' AND Cancelled = 0`
      });

      if (events.length === 0) return 0;

      // Get participants with status 3 or 4 (present)
      const eventParticipants = await this.batchGetTableRecords<{
        Participant_ID: number;
      }>({
        table: 'Event_Participants',
        select: 'Participant_ID',
        ids: events.map(e => e.Event_ID),
        idColumn: 'Event_ID',
        extraFilter: 'Participation_Status_ID IN (3, 4)'
      });

      const uniqueParticipants = new Set(eventParticipants.map(p => p.Participant_ID));
      return uniqueParticipants.size;
    } catch (error) {
      console.error('Error fetching unique event participants:', error);
      return 0;
    }
  }

  // ---------------------------------------------------------------
  // Feed Your Soul: Roster vs Attendance
  // ---------------------------------------------------------------

  private async getRosterVsAttendance(startDate: Date, endDate: Date): Promise<RosterVsAttendance[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Get community and small group types
      const groups = await this.mp!.getTableRecords<{
        Group_ID: number;
        Group_Type_ID: number;
      }>({
        table: 'Groups',
        select: 'Group_ID,Group_Type_ID',
        filter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
      });

      if (groups.length === 0) return [];

      const groupTypeIds = new Set(groups.map(g => g.Group_Type_ID));
      const groupTypes = await this.getGroupTypesWithCache(groupTypeIds);

      // Filter for community and small group types
      const relevantTypeIds = new Set(
        groupTypes
          .filter(gt =>
            gt.Group_Type.toLowerCase().includes('small') ||
            gt.Group_Type.toLowerCase().includes('life') ||
            gt.Group_Type.toLowerCase().includes('community')
          )
          .map(gt => gt.Group_Type_ID)
      );

      const relevantGroups = groups.filter(g => relevantTypeIds.has(g.Group_Type_ID));
      if (relevantGroups.length === 0) return [];

      const groupTypeMap = new Map(groupTypes.map(gt => [gt.Group_Type_ID, gt.Group_Type]));
      const groupToTypeMap = new Map(relevantGroups.map(g => [g.Group_ID, g.Group_Type_ID]));
      const relevantGroupIds = relevantGroups.map(g => g.Group_ID);

      // Roster: Group_Participants active during period
      const rosterParticipants = await this.batchGetTableRecords<{
        Group_ID: number;
        Participant_ID: number;
      }>({
        table: 'Group_Participants',
        select: 'Group_ID,Participant_ID',
        ids: relevantGroupIds,
        idColumn: 'Group_ID',
        extraFilter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
      });

      // Attendance: Event_Participants with present status for events linked to these groups
      const attendanceParticipants = await this.batchGetTableRecords<{
        Group_ID: number;
        Participant_ID: number;
      }>({
        table: 'Event_Participants',
        select: 'Group_ID,Participant_ID',
        ids: relevantGroupIds,
        idColumn: 'Group_ID',
        extraFilter: 'Participation_Status_ID IN (3, 4)'
      });

      // Aggregate by group type
      const typeRoster = new Map<number, Set<number>>();
      const typeAttendance = new Map<number, Set<number>>();

      for (const gp of rosterParticipants) {
        const typeId = groupToTypeMap.get(gp.Group_ID);
        if (!typeId) continue;
        if (!typeRoster.has(typeId)) typeRoster.set(typeId, new Set());
        typeRoster.get(typeId)!.add(gp.Participant_ID);
      }

      for (const ep of attendanceParticipants) {
        const typeId = groupToTypeMap.get(ep.Group_ID);
        if (!typeId) continue;
        if (!typeAttendance.has(typeId)) typeAttendance.set(typeId, new Set());
        typeAttendance.get(typeId)!.add(ep.Participant_ID);
      }

      const results: RosterVsAttendance[] = [];
      for (const typeId of relevantTypeIds) {
        const name = groupTypeMap.get(typeId) || 'Unknown';
        results.push({
          groupTypeName: name,
          rosterCount: typeRoster.get(typeId)?.size || 0,
          attendanceCount: typeAttendance.get(typeId)?.size || 0,
        });
      }

      return results.filter(r => r.rosterCount > 0 || r.attendanceCount > 0);
    } catch (error) {
      console.error('Error fetching roster vs attendance:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Grow in Love: Serving/Leading helpers
  // ---------------------------------------------------------------

  /**
   * Gets Group_Participants in serving (Group_Role_Type_ID=3) or leading (Group_Role_Type_ID=1) roles
   */
  private async getServingLeadingParticipants(startDate: Date, endDate: Date): Promise<{
    participantId: number;
    contactId: number;
    groupId: number;
    groupRoleId: number;
    roleTypeId: number;
    startDate: string;
    endDate: string | null;
  }[]> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
      // Get all Group_Roles that are serving (type 3) or leading (type 1)
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

      // Get Group_Participants with those roles, active during the period
      const participants = await this.batchGetTableRecords<{
        Participant_ID: number;
        Group_ID: number;
        Group_Role_ID: number;
        Start_Date: string;
        End_Date: string | null;
      }>({
        table: 'Group_Participants',
        select: 'Participant_ID,Group_ID,Group_Role_ID,Start_Date,End_Date',
        ids: servingRoleIds,
        idColumn: 'Group_Role_ID',
        extraFilter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
      });

      // Get Participant → Contact mapping
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

      return participants.map(p => ({
        participantId: p.Participant_ID,
        contactId: contactMap.get(p.Participant_ID) || 0,
        groupId: p.Group_ID,
        groupRoleId: p.Group_Role_ID,
        roleTypeId: roleTypeMap.get(p.Group_Role_ID) || 0,
        startDate: p.Start_Date,
        endDate: p.End_Date,
      }));
    } catch (error) {
      console.error('Error fetching serving/leading participants:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Grow in Love: Total Serving/Leading count
  // ---------------------------------------------------------------

  private async getTotalServingLeading(startDate: Date, endDate: Date): Promise<number> {
    try {
      const participants = await this.getServingLeadingParticipants(startDate, endDate);
      const uniqueContacts = new Set(participants.map(p => p.contactId));
      return uniqueContacts.size;
    } catch (error) {
      console.error('Error fetching total serving/leading:', error);
      return 0;
    }
  }

  // ---------------------------------------------------------------
  // Grow in Love: Serving Trends (monthly)
  // ---------------------------------------------------------------

  private async getServingTrends(startDate: Date, endDate: Date): Promise<ServingTrend[]> {
    try {
      const participants = await this.getServingLeadingParticipants(startDate, endDate);
      if (participants.length === 0) return [];

      const trends: ServingTrend[] = [];
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        const servingContacts = new Set<number>();
        const leadingContacts = new Set<number>();
        const allContacts = new Set<number>();

        for (const p of participants) {
          const pStart = new Date(p.startDate);
          const pEnd = p.endDate ? new Date(p.endDate) : null;
          if (pStart <= monthEnd && (!pEnd || pEnd >= monthStart)) {
            allContacts.add(p.contactId);
            if (p.roleTypeId === 3) servingContacts.add(p.contactId);
            if (p.roleTypeId === 1) leadingContacts.add(p.contactId);
          }
        }

        trends.push({
          month: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
          monthName: MONTH_NAMES[currentDate.getMonth()],
          servingCount: servingContacts.size,
          leadingCount: leadingContacts.size,
          totalCount: allContacts.size,
        });

        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      return trends;
    } catch (error) {
      console.error('Error fetching serving trends:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Grow in Love: Serving by Role Type
  // ---------------------------------------------------------------

  private async getServingByRoleType(startDate: Date, endDate: Date): Promise<ServingByRoleType[]> {
    try {
      const participants = await this.getServingLeadingParticipants(startDate, endDate);
      if (participants.length === 0) return [];

      // Get Group_Role_Types for display names
      const roleTypes = await this.mp!.getTableRecords<{
        Group_Role_Type_ID: number;
        Group_Role_Type: string;
      }>({
        table: 'Group_Role_Types',
        select: 'Group_Role_Type_ID,Group_Role_Type',
        filter: 'Group_Role_Type_ID IN (1, 3)'
      });
      const roleTypeNameMap = new Map(roleTypes.map(rt => [rt.Group_Role_Type_ID, rt.Group_Role_Type]));

      const byType = new Map<number, Set<number>>();
      for (const p of participants) {
        if (!byType.has(p.roleTypeId)) byType.set(p.roleTypeId, new Set());
        byType.get(p.roleTypeId)!.add(p.contactId);
      }

      return Array.from(byType.entries()).map(([typeId, contacts]) => ({
        roleTypeId: typeId,
        roleTypeName: roleTypeNameMap.get(typeId) || (typeId === 1 ? 'Leader' : 'Servant'),
        uniqueContacts: contacts.size,
      }));
    } catch (error) {
      console.error('Error fetching serving by role type:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Grow in Love: Serving by Ministry
  // ---------------------------------------------------------------

  private async getServingByMinistry(startDate: Date, endDate: Date): Promise<ServingByMinistry[]> {
    try {
      const participants = await this.getServingLeadingParticipants(startDate, endDate);
      if (participants.length === 0) return [];

      // Get Group_Roles with Ministry_ID
      const roleIds = [...new Set(participants.map(p => p.groupRoleId))];
      const roles = await this.batchGetTableRecords<{
        Group_Role_ID: number;
        Ministry_ID: number | null;
      }>({
        table: 'Group_Roles',
        select: 'Group_Role_ID,Ministry_ID',
        ids: roleIds,
        idColumn: 'Group_Role_ID'
      });
      const roleMinistryMap = new Map(roles.map(r => [r.Group_Role_ID, r.Ministry_ID]));

      // Get Ministry names
      const ministryIds = [...new Set(roles.map(r => r.Ministry_ID).filter((id): id is number => id !== null))];
      if (ministryIds.length === 0) return [];

      const ministries = await this.batchGetTableRecords<{
        Ministry_ID: number;
        Ministry_Name: string;
      }>({
        table: 'Ministries',
        select: 'Ministry_ID,Ministry_Name',
        ids: ministryIds,
        idColumn: 'Ministry_ID'
      });
      const ministryNameMap = new Map(ministries.map(m => [m.Ministry_ID, m.Ministry_Name]));

      const byMinistry = new Map<number, Set<number>>();
      for (const p of participants) {
        const ministryId = roleMinistryMap.get(p.groupRoleId);
        if (!ministryId) continue;
        if (!byMinistry.has(ministryId)) byMinistry.set(ministryId, new Set());
        byMinistry.get(ministryId)!.add(p.contactId);
      }

      return Array.from(byMinistry.entries())
        .map(([ministryId, contacts]) => ({
          ministryId,
          ministryName: ministryNameMap.get(ministryId) || 'Unknown',
          uniqueContacts: contacts.size,
        }))
        .sort((a, b) => b.uniqueContacts - a.uniqueContacts);
    } catch (error) {
      console.error('Error fetching serving by ministry:', error);
      return [];
    }
  }

  // ---------------------------------------------------------------
  // Engagement Venn Diagram: 3-way overlap
  // ---------------------------------------------------------------

  private async getEngagementOverlap(startDate: Date, endDate: Date): Promise<EngagementOverlap> {
    const empty: EngagementOverlap = {
      activityOnly: 0, groupOnly: 0, servingOnly: 0,
      activityAndGroup: 0, activityAndServing: 0, groupAndServing: 0,
      allThree: 0, totalActivity: 0, totalGroup: 0, totalServing: 0,
    };

    try {
      const startIso = startDate.toISOString();
      const endIso = endDate.toISOString();

      // Run all three queries in parallel
      const [activityContacts, groupContacts, servingContacts] = await Promise.all([
        this.getActivityContactIds(startIso, endIso),
        this.getGroupContactIds(startIso, endIso),
        this.getServingContactIds(startIso, endIso),
      ]);

      // Compute 7 regions
      const allThree = new Set([...activityContacts].filter(c => groupContacts.has(c) && servingContacts.has(c)));
      const actAndGroup = new Set([...activityContacts].filter(c => groupContacts.has(c) && !servingContacts.has(c)));
      const actAndServing = new Set([...activityContacts].filter(c => !groupContacts.has(c) && servingContacts.has(c)));
      const groupAndServing = new Set([...groupContacts].filter(c => !activityContacts.has(c) && servingContacts.has(c)));
      const actOnly = new Set([...activityContacts].filter(c => !groupContacts.has(c) && !servingContacts.has(c)));
      const groupOnly = new Set([...groupContacts].filter(c => !activityContacts.has(c) && !servingContacts.has(c)));
      const servingOnly = new Set([...servingContacts].filter(c => !activityContacts.has(c) && !groupContacts.has(c)));

      return {
        activityOnly: actOnly.size,
        groupOnly: groupOnly.size,
        servingOnly: servingOnly.size,
        activityAndGroup: actAndGroup.size,
        activityAndServing: actAndServing.size,
        groupAndServing: groupAndServing.size,
        allThree: allThree.size,
        totalActivity: activityContacts.size,
        totalGroup: groupContacts.size,
        totalServing: servingContacts.size,
      };
    } catch (error) {
      console.error('Error fetching engagement overlap:', error);
      return empty;
    }
  }

  /** Any Activity: unique Contact_IDs from Event_Participants with present status */
  private async getActivityContactIds(startIso: string, endIso: string): Promise<Set<number>> {
    const events = await this.mp!.getTableRecords<{ Event_ID: number }>({
      table: 'Events',
      select: 'Event_ID',
      filter: `Event_Start_Date >= '${startIso}' AND Event_End_Date <= '${endIso}' AND Cancelled = 0`
    });
    if (events.length === 0) return new Set();

    const participants = await this.batchGetTableRecords<{ Participant_ID: number }>({
      table: 'Event_Participants',
      select: 'Participant_ID',
      ids: events.map(e => e.Event_ID),
      idColumn: 'Event_ID',
      extraFilter: 'Participation_Status_ID IN (3, 4)'
    });

    const participantIds = [...new Set(participants.map(p => p.Participant_ID))];
    if (participantIds.length === 0) return new Set();

    const contacts = await this.batchGetTableRecords<{ Participant_ID: number; Contact_ID: number }>({
      table: 'Participants',
      select: 'Participant_ID,Contact_ID',
      ids: participantIds,
      idColumn: 'Participant_ID'
    });

    return new Set(contacts.map(c => c.Contact_ID));
  }

  /** Small Group/Community: unique Contact_IDs from Group_Participants in community/small group types */
  private async getGroupContactIds(startIso: string, endIso: string): Promise<Set<number>> {
    const groups = await this.mp!.getTableRecords<{ Group_ID: number; Group_Type_ID: number }>({
      table: 'Groups',
      select: 'Group_ID,Group_Type_ID',
      filter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
    });
    if (groups.length === 0) return new Set();

    const groupTypeIds = new Set(groups.map(g => g.Group_Type_ID));
    const groupTypes = await this.getGroupTypesWithCache(groupTypeIds);
    const smallGroupTypeIds = new Set(
      groupTypes
        .filter(gt =>
          gt.Group_Type.toLowerCase().includes('small') ||
          gt.Group_Type.toLowerCase().includes('life') ||
          gt.Group_Type.toLowerCase().includes('community')
        )
        .map(gt => gt.Group_Type_ID)
    );

    const relevantGroupIds = groups
      .filter(g => smallGroupTypeIds.has(g.Group_Type_ID))
      .map(g => g.Group_ID);
    if (relevantGroupIds.length === 0) return new Set();

    const participants = await this.batchGetTableRecords<{ Participant_ID: number }>({
      table: 'Group_Participants',
      select: 'Participant_ID',
      ids: relevantGroupIds,
      idColumn: 'Group_ID',
      extraFilter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
    });

    const participantIds = [...new Set(participants.map(p => p.Participant_ID))];
    if (participantIds.length === 0) return new Set();

    const contacts = await this.batchGetTableRecords<{ Participant_ID: number; Contact_ID: number }>({
      table: 'Participants',
      select: 'Participant_ID,Contact_ID',
      ids: participantIds,
      idColumn: 'Participant_ID'
    });

    return new Set(contacts.map(c => c.Contact_ID));
  }

  /** Serving/Leading: unique Contact_IDs from Group_Participants with serving/leading role types */
  private async getServingContactIds(startIso: string, endIso: string): Promise<Set<number>> {
    const roles = await this.mp!.getTableRecords<{ Group_Role_ID: number }>({
      table: 'Group_Roles',
      select: 'Group_Role_ID',
      filter: 'Group_Role_Type_ID IN (1, 3)'
    });
    if (roles.length === 0) return new Set();

    const participants = await this.batchGetTableRecords<{ Participant_ID: number }>({
      table: 'Group_Participants',
      select: 'Participant_ID',
      ids: roles.map(r => r.Group_Role_ID),
      idColumn: 'Group_Role_ID',
      extraFilter: `Start_Date <= '${endIso}' AND (End_Date IS NULL OR End_Date >= '${startIso}')`
    });

    const participantIds = [...new Set(participants.map(p => p.Participant_ID))];
    if (participantIds.length === 0) return new Set();

    const contacts = await this.batchGetTableRecords<{ Participant_ID: number; Contact_ID: number }>({
      table: 'Participants',
      select: 'Participant_ID,Contact_ID',
      ids: participantIds,
      idColumn: 'Participant_ID'
    });

    return new Set(contacts.map(c => c.Contact_ID));
  }
}
