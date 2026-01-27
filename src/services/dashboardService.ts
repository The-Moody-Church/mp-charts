import { MPHelper } from '@/lib/providers/ministry-platform';
import {
  DashboardData,
  GroupTypeMetrics,
  EventTypeMetrics,
  PeriodMetrics,
  YearOverYearMetrics,
  SmallGroupTrend
} from '@/lib/dto';

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

  /**
   * Private constructor to enforce singleton pattern
   * Initializes the service when instantiated
   */
  private constructor() {
    this.initialize();
  }

  /**
   * Gets the singleton instance of DashboardService
   * Creates a new instance if one doesn't exist and ensures it's properly initialized
   *
   * @returns Promise<DashboardService> - The initialized DashboardService instance
   */
  public static async getInstance(): Promise<DashboardService> {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
      await DashboardService.instance.initialize();
    }
    return DashboardService.instance;
  }

  /**
   * Initializes the DashboardService by creating a new MPHelper instance
   * This method sets up the Ministry Platform connection helper
   *
   * @returns Promise<void>
   */
  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
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

    // Fetch all metrics in parallel for better performance
    const [
      currentPeriod,
      previousPeriod,
      groupTypeMetrics,
      eventTypeMetrics,
      smallGroupTrends
    ] = await Promise.all([
      this.getPeriodMetrics(currentYearStart, currentYearEnd),
      this.getPeriodMetrics(previousYearStart, previousYearEnd),
      this.getGroupTypeMetrics(currentYearStart, currentYearEnd),
      this.getEventTypeMetrics(currentYearStart, currentYearEnd),
      this.getSmallGroupTrends(currentYearStart, currentYearEnd)
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
      // Query aggregated group participation data
      const results = await this.mp!.getTableRecords<{
        Group_Type_ID: number;
        Group_Type: string;
        Active_Group_Count: number;
        Total_Participants: number;
        Unique_Participants: number;
      }>({
        table: 'Group_Participants',
        select: `
          Group_Participants.Group_ID_Table.Group_Type_ID_Table.Group_Type_ID,
          Group_Participants.Group_ID_Table.Group_Type_ID_Table.Group_Type,
          COUNT(DISTINCT Group_Participants.Group_ID) AS Active_Group_Count,
          COUNT(Group_Participants.Group_Participant_ID) AS Total_Participants,
          COUNT(DISTINCT Group_Participants.Participant_ID) AS Unique_Participants
        `,
        filter: `
          Group_Participants.Start_Date <= '${endIso}' AND
          (Group_Participants.End_Date IS NULL OR Group_Participants.End_Date >= '${startIso}') AND
          Group_Participants.Group_ID_Table.Start_Date <= '${endIso}' AND
          (Group_Participants.Group_ID_Table.End_Date IS NULL OR Group_Participants.Group_ID_Table.End_Date >= '${startIso}')
        `,
        groupBy: `
          Group_Participants.Group_ID_Table.Group_Type_ID_Table.Group_Type_ID,
          Group_Participants.Group_ID_Table.Group_Type_ID_Table.Group_Type
        `
      });

      return results.map(r => ({
        groupTypeId: r.Group_Type_ID,
        groupTypeName: r.Group_Type,
        activeGroupCount: r.Active_Group_Count,
        totalParticipants: r.Total_Participants,
        uniqueParticipants: r.Unique_Participants,
        averageGroupSize: r.Active_Group_Count > 0
          ? Math.round(r.Unique_Participants / r.Active_Group_Count)
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
      // Query aggregated event participation data
      const results = await this.mp!.getTableRecords<{
        Event_Type_ID: number;
        Event_Type: string;
        Event_Count: number;
        Total_Attendance: number;
        Unique_Attendees: number;
      }>({
        table: 'Event_Participants',
        select: `
          Event_Participants.Event_ID_Table.Event_Type_ID_Table.Event_Type_ID,
          Event_Participants.Event_ID_Table.Event_Type_ID_Table.Event_Type,
          COUNT(DISTINCT Event_Participants.Event_ID) AS Event_Count,
          COUNT(Event_Participants.Event_Participant_ID) AS Total_Attendance,
          COUNT(DISTINCT Event_Participants.Participant_ID) AS Unique_Attendees
        `,
        filter: `
          Event_Participants.Event_ID_Table.Event_Start_Date >= '${startIso}' AND
          Event_Participants.Event_ID_Table.Event_End_Date <= '${endIso}' AND
          Event_Participants.Event_ID_Table.Cancelled = 0 AND
          Event_Participants.Participation_Status_ID = 3
        `,
        groupBy: `
          Event_Participants.Event_ID_Table.Event_Type_ID_Table.Event_Type_ID,
          Event_Participants.Event_ID_Table.Event_Type_ID_Table.Event_Type
        `
      });

      return results.map(r => ({
        eventTypeId: r.Event_Type_ID,
        eventTypeName: r.Event_Type,
        eventCount: r.Event_Count,
        totalAttendance: r.Total_Attendance,
        uniqueAttendees: r.Unique_Attendees,
        averageAttendance: r.Event_Count > 0
          ? Math.round(r.Total_Attendance / r.Event_Count)
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
      const results = await this.mp!.getTableRecords<{
        Total_Events: number;
        Total_Attendance: number;
        Unique_Attendees: number;
      }>({
        table: 'Event_Participants',
        select: `
          COUNT(DISTINCT Event_Participants.Event_ID) AS Total_Events,
          COUNT(Event_Participants.Event_Participant_ID) AS Total_Attendance,
          COUNT(DISTINCT Event_Participants.Participant_ID) AS Unique_Attendees
        `,
        filter: `
          Event_Participants.Event_ID_Table.Event_Start_Date >= '${startIso}' AND
          Event_Participants.Event_ID_Table.Event_End_Date <= '${endIso}' AND
          Event_Participants.Event_ID_Table.Cancelled = 0 AND
          Event_Participants.Participation_Status_ID = 3
        `
      });

      const data = results[0] || { Total_Events: 0, Total_Attendance: 0, Unique_Attendees: 0 };

      return {
        periodStart: startIso,
        periodEnd: endIso,
        totalEvents: data.Total_Events,
        averageAttendance: data.Total_Events > 0
          ? Math.round(data.Total_Attendance / data.Total_Events)
          : 0,
        uniqueAttendees: data.Unique_Attendees
      };
    } catch (error) {
      console.error('Error fetching period metrics:', error);
      return {
        periodStart: startIso,
        periodEnd: endIso,
        averageAttendance: 0,
        uniqueAttendees: 0,
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
  private async getSmallGroupTrends(
    startDate: Date,
    endDate: Date
  ): Promise<SmallGroupTrend[]> {
    try {
      const trends: SmallGroupTrend[] = [];
      const currentDate = new Date(startDate);

      // Loop through each month in the period
      while (currentDate <= endDate) {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

        // Get group metrics for this month
        const monthMetrics = await this.getGroupTypeMetrics(monthStart, monthEnd);

        // Filter for small groups/life groups
        // Note: Adjust these filters based on actual group type names in MP
        const smallGroups = monthMetrics.filter(m =>
          m.groupTypeName.toLowerCase().includes('small') ||
          m.groupTypeName.toLowerCase().includes('life') ||
          m.groupTypeName.toLowerCase().includes('community')
        );

        trends.push({
          month: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`,
          activeGroupCount: smallGroups.reduce((sum, g) => sum + g.activeGroupCount, 0),
          totalParticipants: smallGroups.reduce((sum, g) => sum + g.totalParticipants, 0),
          averageAttendance: smallGroups.reduce((sum, g) => sum + g.averageGroupSize, 0)
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
}
