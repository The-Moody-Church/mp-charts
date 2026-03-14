/**
 * Represents metrics for a specific time period
 */
export interface PeriodMetrics {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  averageAttendance: number;
  averageInPersonAttendance: number;
  averageOnlineAttendance: number;
  totalEvents: number;
}

/**
 * Group participation metrics by group type
 */
export interface GroupTypeMetrics {
  groupTypeId: number;
  groupTypeName: string;
  ministryId: number | null;
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
 * Raw serving/leading record for client-side date filtering.
 * Each record represents a person in a serving or leading role.
 */
export interface ServingLeadingRecord {
  contactId: number;
  roleTypeId: number;      // 1=Leader, 3=Servant
  roleTypeName: string;
  ministryId: number | null;
  ministryName: string | null;
  startDate: string;       // ISO date
  endDate: string | null;  // ISO date or null (still active)
}

/**
 * Raw activity data bucketed by month for engagement venn client-side filtering.
 * Each entry contains unique Contact_IDs who had any activity in that month.
 */
export interface EngagementActivityMonth {
  month: string; // YYYY-MM
  contactIds: number[];
}

/**
 * Raw group participation record for engagement venn client-side filtering.
 * Each record represents a person in a group within Ministry_ID=8.
 */
export interface EngagementGroupRecord {
  contactId: number;
  startDate: string;       // ISO date
  endDate: string | null;  // ISO date or null (still active)
}

/**
 * Raw data for computing the engagement venn diagram on the client.
 * All three dimensions (activity, group, serving) are filtered by date client-side.
 */
export interface EngagementRawData {
  activityByMonth: EngagementActivityMonth[];
  groupRecords: EngagementGroupRecord[];
  /** Pre-filtered set of adult Contact_IDs (age >= 18 or null DOB) */
  adultContactIds: number[];
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
 * Roster vs attendance comparison data (aggregated, computed by filterDashboardData)
 */
export interface RosterVsAttendance {
  groupTypeName: string;
  rosterCount: number;
  attendanceCount: number;
}

/**
 * Raw event participant data bucketed by month for client-side date filtering.
 * Each entry contains the unique Participant_IDs who attended events in that month.
 */
export interface EventParticipantMonth {
  month: string; // YYYY-MM
  participantIds: number[];
}

/**
 * Raw group roster membership record for client-side date filtering.
 * Each entry represents a unique person on a group roster.
 */
export interface RosterMemberRecord {
  contactId: number;
  groupTypeId: number;
  groupTypeName: string;
  startDate: string; // ISO date
  endDate: string | null; // ISO date or null (still active)
}

/**
 * Raw group attendance data bucketed by month and group type for client-side date filtering.
 * Each entry contains the unique Contact_IDs who attended for a given group type in that month.
 */
export interface AttendanceMonthRecord {
  month: string; // YYYY-MM
  groupTypeId: number;
  groupTypeName: string;
  contactIds: number[];
}

/**
 * Complete dashboard data
 */
export interface DashboardData {
  currentPeriod: PeriodMetrics;
  previousPeriod: PeriodMetrics;
  groupTypeMetrics: GroupTypeMetrics[];
  yearOverYear: YearOverYearMetrics[];
  smallGroupTrends: SmallGroupTrend[];
  previousYearSmallGroupTrends: SmallGroupTrend[];
  communityAttendanceTrends: CommunityAttendanceTrend[];
  previousYearCommunityAttendanceTrends: CommunityAttendanceTrend[];
  monthlyAttendanceTrends: MonthlyAttendanceTrend[];
  previousYearMonthlyAttendanceTrends: MonthlyAttendanceTrend[];
  weeklyAttendanceTrends: WeeklyAttendanceTrend[];
  weeklyCommunityAttendanceTrends: CommunityAttendanceTrend[];
  /** Baptism milestone dates (Date_Accomplished ISO strings) for client-side filtering */
  baptismDates: string[];
  /** Registered Member milestone dates for client-side filtering */
  membershipDates: string[];
  /** Associate Member milestone dates for client-side filtering */
  associateMemberDates: string[];
  /** Youth Member milestone dates for client-side filtering */
  youthMemberDates: string[];
  /** Computed counts for the selected period (set by filterDashboardData) */
  baptismsCurrentPeriod: number;
  baptismsPreviousPeriod: number;
  membershipCurrentPeriod: number;
  membershipPreviousPeriod: number;
  /** Computed unique event participants count (set by filterDashboardData) */
  uniqueEventParticipants: number;
  /** Raw event participant data bucketed by month for client-side filtering */
  eventParticipantsByMonth: EventParticipantMonth[];
  /** Computed roster vs attendance (set by filterDashboardData) */
  rosterVsAttendance: RosterVsAttendance[];
  /** Raw roster membership records for client-side filtering */
  rosterMemberRecords: RosterMemberRecord[];
  /** Raw attendance data bucketed by month and group type for client-side filtering */
  attendanceByMonth: AttendanceMonthRecord[];
  // Grow in Love — serving/leading
  servingTrends: ServingTrend[];
  previousYearServingTrends: ServingTrend[];
  servingByRoleType: ServingByRoleType[];
  servingByMinistry: ServingByMinistry[];
  totalServingLeading: number;
  /** Raw serving/leading records for client-side date filtering */
  servingLeadingRecords: ServingLeadingRecord[];
  // Engagement Venn
  engagementOverlap: EngagementOverlap;
  /** Raw data for client-side engagement venn computation */
  engagementRawData: EngagementRawData;
  generatedAt: string;
}
