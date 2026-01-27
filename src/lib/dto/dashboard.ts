/**
 * Represents metrics for a specific time period
 */
export interface PeriodMetrics {
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
  averageAttendance: number;
  uniqueAttendees: number;
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
  uniqueAttendees: number;
  totalAttendance: number;
}

/**
 * Small group trend data (monthly aggregation)
 */
export interface SmallGroupTrend {
  month: string; // YYYY-MM
  activeGroupCount: number;
  totalParticipants: number;
  averageAttendance: number;
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
  generatedAt: string;
}
