'use client';

import { DashboardData } from '@/lib/dto';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from './metric-card';
import { AttendanceChart } from './attendance-chart';
import { GroupParticipationChart } from './group-participation-chart';
import { YearOverYearComparison } from './year-over-year-comparison';
import { SmallGroupTrends } from './small-group-trends';
import { CommunityAttendanceChart } from './community-attendance-chart';
import { ExpandableChart } from './expandable-chart';
import { SectionWrapper } from './section-wrapper';
import { VennDiagram } from './venn-diagram';
import { RosterVsAttendanceChart } from './roster-vs-attendance';
import { ServingTrendsChart, ServingByRoleTypeChart, ServingByMinistryChart } from './serving-charts';

interface DashboardMetricsProps {
  data: DashboardData;
  showCompare?: boolean;
  isSingleMonth?: boolean;
}

export function DashboardMetrics({ data, showCompare = true, isSingleMonth = false }: DashboardMetricsProps) {
  return (
    <div className="space-y-10">
      {/* Engagement Venn Diagram */}
      <Card>
        <CardHeader>
          <CardTitle>Engagement Overview</CardTitle>
          <CardDescription>People engaged across three dimensions: activity attendance, small groups, and serving/leading</CardDescription>
        </CardHeader>
        <CardContent>
          <VennDiagram data={data.engagementOverlap} />
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Section 1: Know God */}
      {/* ============================================================ */}
      <SectionWrapper title="Know God">
        {/* Metric Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Avg In-Person Attendance"
            value={data.currentPeriod.averageInPersonAttendance}
            previousValue={showCompare ? data.previousPeriod.averageInPersonAttendance : undefined}
            format="number"
          />
          <MetricCard
            title="Avg Online Attendance"
            value={data.currentPeriod.averageOnlineAttendance}
            previousValue={showCompare ? data.previousPeriod.averageOnlineAttendance : undefined}
            format="number"
          />
          <MetricCard
            title="Baptisms (last 365 days)"
            value={data.baptismsLastYear}
            previousValue={showCompare ? data.baptismsPreviousYear : undefined}
            format="number"
          />
          <MetricCard
            title="New Members (last 365 days)"
            value={data.membershipCount}
            previousValue={showCompare ? data.membershipPreviousCount : undefined}
            format="number"
          />
        </div>

        {/* Worship Service Attendance */}
        <Card>
          <CardHeader>
            <CardTitle>Worship Service Attendance</CardTitle>
            <CardDescription>
              {isSingleMonth ? 'Weekly attendance' : `Monthly average attendance${showCompare ? ' comparison' : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExpandableChart
              title="Worship Service Attendance"
              description={isSingleMonth ? 'Weekly attendance' : `Monthly average attendance${showCompare ? ' comparison' : ''}`}
              expandedChildren={
                <AttendanceChart
                  currentYear={data.monthlyAttendanceTrends}
                  previousYear={showCompare ? data.previousYearMonthlyAttendanceTrends : []}
                  height={600}
                />
              }
            >
              <AttendanceChart
                currentYear={data.monthlyAttendanceTrends}
                previousYear={showCompare ? data.previousYearMonthlyAttendanceTrends : []}
              />
            </ExpandableChart>
          </CardContent>
        </Card>

        {/* Unique Event Participants */}
        <MetricCard
          title="Unique Event Participants"
          value={data.uniqueEventParticipants}
          format="number"
        />
      </SectionWrapper>

      {/* ============================================================ */}
      {/* Section 2: Feed Your Soul */}
      {/* ============================================================ */}
      <SectionWrapper title="Feed Your Soul">
        <MetricCard
          title="Active Communities and Small Groups"
          value={data.groupTypeMetrics
            .filter(g =>
              g.groupTypeName.toLowerCase().includes('small') ||
              g.groupTypeName.toLowerCase().includes('community')
            )
            .reduce((sum, g) => sum + g.activeGroupCount, 0)}
          format="number"
        />

        <div className="grid gap-6 md:grid-cols-2">
          {/* Community Attendance */}
          <Card>
            <CardHeader>
              <CardTitle>Community Sunday Gathering</CardTitle>
              <CardDescription>
                {isSingleMonth ? 'Weekly attendance by community' : 'Average weekly attendance by community'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExpandableChart
                title="Community Sunday Gathering Attendance"
                description={isSingleMonth ? 'Weekly attendance for each community' : 'Average weekly attendance for each community'}
                expandedChildren={
                  <CommunityAttendanceChart data={data.communityAttendanceTrends} height={600} />
                }
              >
                <CommunityAttendanceChart data={data.communityAttendanceTrends} />
              </ExpandableChart>
            </CardContent>
          </Card>

          {/* Small Group Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Small Group Trends</CardTitle>
              <CardDescription>Monthly small group participation{showCompare ? ' comparison' : ''}</CardDescription>
            </CardHeader>
            <CardContent>
              <ExpandableChart
                title="Small Group Trends"
                description={`Monthly small group participation${showCompare ? ' comparison' : ''}`}
                expandedChildren={
                  <SmallGroupTrends
                    data={data.smallGroupTrends}
                    previousYear={showCompare ? data.previousYearSmallGroupTrends : []}
                    height={600}
                  />
                }
              >
                <SmallGroupTrends
                  data={data.smallGroupTrends}
                  previousYear={showCompare ? data.previousYearSmallGroupTrends : []}
                />
              </ExpandableChart>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Group Participation */}
          <Card>
            <CardHeader>
              <CardTitle>Group Participation by Type</CardTitle>
              <CardDescription>Active participants by group type</CardDescription>
            </CardHeader>
            <CardContent>
              <ExpandableChart
                title="Group Participation"
                description="Active participants by group type"
                expandedChildren={
                  <GroupParticipationChart data={data.groupTypeMetrics} height={600} radius={200} />
                }
              >
                <GroupParticipationChart data={data.groupTypeMetrics} />
              </ExpandableChart>
            </CardContent>
          </Card>

          {/* Roster vs Attendance */}
          <Card>
            <CardHeader>
              <CardTitle>Roster vs Attendance</CardTitle>
              <CardDescription>Group roster count vs actual event check-in count</CardDescription>
            </CardHeader>
            <CardContent>
              <ExpandableChart
                title="Roster vs Attendance"
                description="Comparison of people on group rosters vs people who attended events"
                expandedChildren={
                  <RosterVsAttendanceChart data={data.rosterVsAttendance} height={600} />
                }
              >
                <RosterVsAttendanceChart data={data.rosterVsAttendance} />
              </ExpandableChart>
            </CardContent>
          </Card>
        </div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/* Section 3: Grow in Love */}
      {/* ============================================================ */}
      <SectionWrapper title="Grow in Love">
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard
            title="Total Serving/Leading"
            value={data.totalServingLeading}
            format="number"
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Serving by Role Type</CardTitle>
            </CardHeader>
            <CardContent>
              <ServingByRoleTypeChart data={data.servingByRoleType} height={200} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Where People Serve */}
          <Card>
            <CardHeader>
              <CardTitle>Where People Serve</CardTitle>
              <CardDescription>Distribution of volunteers across ministries</CardDescription>
            </CardHeader>
            <CardContent>
              <ExpandableChart
                title="Where People Serve"
                description="Distribution of volunteers across ministries"
                expandedChildren={
                  <ServingByMinistryChart data={data.servingByMinistry} height={600} />
                }
              >
                <ServingByMinistryChart data={data.servingByMinistry} />
              </ExpandableChart>
            </CardContent>
          </Card>

          {/* Serving Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Serving Trends</CardTitle>
              <CardDescription>Monthly active servers and leaders over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ExpandableChart
                title="Serving Trends"
                description="Monthly active servers and leaders over time"
                expandedChildren={
                  <ServingTrendsChart data={data.servingTrends} height={600} />
                }
              >
                <ServingTrendsChart data={data.servingTrends} />
              </ExpandableChart>
            </CardContent>
          </Card>
        </div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/* Section 4: Other */}
      {/* ============================================================ */}
      {showCompare && (
        <SectionWrapper title="Other">
          <Card>
            <CardHeader>
              <CardTitle>Period Comparison</CardTitle>
              <CardDescription>Performance vs. previous period</CardDescription>
            </CardHeader>
            <CardContent>
              <YearOverYearComparison data={data.yearOverYear} />
            </CardContent>
          </Card>
        </SectionWrapper>
      )}

      {/* Debug Info - Development only */}
      {process.env.NODE_ENV === 'development' && (
        <Card>
          <CardHeader>
            <CardTitle>Data Summary</CardTitle>
            <CardDescription>Current dashboard data (for verification)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p><strong>Group Types:</strong> {data.groupTypeMetrics.length} types tracked</p>
              <p><strong>Event Types:</strong> {data.eventTypeMetrics.length} types tracked</p>
              <p suppressHydrationWarning><strong>Period:</strong> {new Date(data.currentPeriod.periodStart).toLocaleDateString()} - {new Date(data.currentPeriod.periodEnd).toLocaleDateString()}</p>
              <p suppressHydrationWarning><strong>Generated:</strong> {new Date(data.generatedAt).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
