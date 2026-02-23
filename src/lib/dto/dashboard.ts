/**
 * Represents metrics for a specific time period
 */
export interface PeriodMetrics {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  averageAttendance: number;
  averageInPersonAttendance: number;
  averageOnlineAttendance: number;
  uniqueAttendees: number;
  uniqueInPersonAttendees: number;
  uniqueOnlineAttendees: number;
  totalEvents: number;
}

/**
 * Group participation metrics by group type
 */
export interface GroupTypeMetrics {
  groupTypeId: number;
  groupTypeName: string;
  activeGroupCount: number;
  totalParticipants: number;
  uniqueParticipants: number;
  averageGroupSize: number;
}

/**
 * Year-over-year comparison data
 */
export interface YearOverYearMetrics {
  metric: string; // e.g., "Sunday Morning Attendance"
  currentYear: number;
  previousYear: number;
  percentageChange: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * Event attendance metrics by event type
 */
export interface EventTypeMetrics {
  eventTypeId: number;
  eventTypeName: string;
  eventCount: number;
  averageAttendance: number;
  averageInPersonAttendance: number;
  averageOnlineAttendance: number;
  uniqueAttendees: number;
  uniqueInPersonAttendees: number;
  uniqueOnlineAttendees: number;
  totalAttendance: number;
  totalInPersonAttendance: number;
  totalOnlineAttendance: number;
}

/**
 * Small group trend data (monthly aggregation)
 */
export interface SmallGroupTrend {
  month: string; // YYYY-MM
  monthName: string; // e.g., "September"
  activeGroupCount: number;
  totalParticipants: number;
  averageAttendance: number;
}

/**
 * Community attendance trend data (weekly Sunday gatherings)
 */
export interface CommunityAttendanceTrend {
  weekStartDate: string; // ISO date for the week start (Sunday)
  communityAttendance: { [communityName: string]: number }; // Map of community name to average attendance
}

/**
 * Monthly worship service attendance trend data
 */
export interface MonthlyAttendanceTrend {
  month: string; // YYYY-MM
  monthName: string; // e.g., "September"
  averageInPersonAttendance: number;
  averageOnlineAttendance: number;
  averageTotalAttendance: number;
  eventCount: number;
}

/**
 * Weekly (per-event-date) worship service attendance data
 * Used to show individual data points when a single month is selected
 */
export interface WeeklyAttendanceTrend {
  eventDate: string; // ISO date, e.g. "2026-02-01"
  dateLabel: string; // e.g., "Feb 1"
  inPersonAttendance: number;
  onlineAttendance: number;
  totalAttendance: number;
  eventCount: number;
}

/**
 * Serving/Leading monthly trend data
 */
export interface ServingTrend {
  month: string; // YYYY-MM
  monthName: string;
  servingCount: number;
  leadingCount: number;
  totalCount: number;
}

/**
 * Serving breakdown by role type (e.g., Servant, Leader)
 */
export interface ServingByRoleType {
  roleTypeId: number;
  roleTypeName: string;
  uniqueContacts: number;
}

/**
 * Serving/leading distribution by ministry
 */
export interface ServingByMinistry {
  ministryId: number;
  ministryName: string;
  uniqueContacts: number;
}

/**
 * Giving data by program
 */
export interface GivingByProgram {
  programId: number;
  programName: string;
  totalAmount: number;
}

/**
 * Monthly giving trend
 */
export interface GivingTrend {
  month: string; // YYYY-MM
  monthName: string;
  programAmounts: { [programName: string]: number };
}

/**
 * Engagement overlap data for the 3-circle Venn diagram
 * Three circles: Any Activity, Small Group/Community, Serving/Leading
 */
export interface EngagementOverlap {
  activityOnly: number;
  groupOnly: number;
  servingOnly: number;
  activityAndGroup: number;
  activityAndServing: number;
  groupAndServing: number;
  allThree: number;
  totalActivity: number;
  totalGroup: number;
  totalServing: number;
}

/**
 * Roster vs attendance comparison data
 */
export interface RosterVsAttendance {
  groupTypeName: string;
  rosterCount: number;
  attendanceCount: number;
}

/**
 * Complete dashboard data
 */
export interface DashboardData {
  currentPeriod: PeriodMetrics;
  previousPeriod: PeriodMetrics;
  groupTypeMetrics: GroupTypeMetrics[];
  eventTypeMetrics: EventTypeMetrics[];
  yearOverYear: YearOverYearMetrics[];
  smallGroupTrends: SmallGroupTrend[];
  previousYearSmallGroupTrends: SmallGroupTrend[];
  communityAttendanceTrends: CommunityAttendanceTrend[];
  monthlyAttendanceTrends: MonthlyAttendanceTrend[];
  previousYearMonthlyAttendanceTrends: MonthlyAttendanceTrend[];
  weeklyAttendanceTrends: WeeklyAttendanceTrend[];
  weeklyCommunityAttendanceTrends: CommunityAttendanceTrend[];
  baptismsLastYear: number;
  baptismsPreviousYear: number;
  // New: Know God
  membershipCount: number;
  membershipPreviousCount: number;
  uniqueEventParticipants: number;
  // New: Feed Your Soul
  rosterVsAttendance: RosterVsAttendance[];
  // New: Grow in Love
  servingTrends: ServingTrend[];
  servingByRoleType: ServingByRoleType[];
  servingByMinistry: ServingByMinistry[];
  totalServingLeading: number;
  // New: Change Your World
  givingByProgram: GivingByProgram[];
  givingTrends: GivingTrend[];
  // New: Engagement Venn
  engagementOverlap: EngagementOverlap;
  generatedAt: string;
}
