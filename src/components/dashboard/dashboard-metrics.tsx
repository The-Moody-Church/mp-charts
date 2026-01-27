'use client';

import { DashboardData } from '@/lib/dto';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from './metric-card';
import { AttendanceChart } from './attendance-chart';
import { GroupParticipationChart } from './group-participation-chart';
import { YearOverYearComparison } from './year-over-year-comparison';
import { SmallGroupTrends } from './small-group-trends';

interface DashboardMetricsProps {
  data: DashboardData;
}

export function DashboardMetrics({ data }: DashboardMetricsProps) {
  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Average Attendance"
          value={data.currentPeriod.averageAttendance}
          previousValue={data.previousPeriod.averageAttendance}
          format="number"
        />
        <MetricCard
          title="Unique Attendees"
          value={data.currentPeriod.uniqueAttendees}
          previousValue={data.previousPeriod.uniqueAttendees}
          format="number"
        />
        <MetricCard
          title="Total Events"
          value={data.currentPeriod.totalEvents}
          previousValue={data.previousPeriod.totalEvents}
          format="number"
        />
        <MetricCard
          title="Active Groups"
          value={data.groupTypeMetrics.reduce((sum, g) => sum + g.activeGroupCount, 0)}
          format="number"
        />
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Event Attendance by Type</CardTitle>
            <CardDescription>Average attendance across event types</CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceChart data={data.eventTypeMetrics} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Group Participation</CardTitle>
            <CardDescription>Active participants by group type</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupParticipationChart data={data.groupTypeMetrics} />
          </CardContent>
        </Card>
      </div>

      {/* Year-over-Year Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Year-over-Year Comparison</CardTitle>
          <CardDescription>Performance vs. last ministry year</CardDescription>
        </CardHeader>
        <CardContent>
          <YearOverYearComparison data={data.yearOverYear} />
        </CardContent>
      </Card>

      {/* Small Group Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Small Group Trends</CardTitle>
          <CardDescription>Monthly small group participation</CardDescription>
        </CardHeader>
        <CardContent>
          <SmallGroupTrends data={data.smallGroupTrends} />
        </CardContent>
      </Card>

      {/* Debug Info - Can be removed later */}
      <Card>
        <CardHeader>
          <CardTitle>Data Summary</CardTitle>
          <CardDescription>Current dashboard data (for verification)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>Group Types:</strong> {data.groupTypeMetrics.length} types tracked</p>
            <p><strong>Event Types:</strong> {data.eventTypeMetrics.length} types tracked</p>
            <p><strong>Period:</strong> {new Date(data.currentPeriod.periodStart).toLocaleDateString()} - {new Date(data.currentPeriod.periodEnd).toLocaleDateString()}</p>
            <p><strong>Generated:</strong> {new Date(data.generatedAt).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
