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
import { CommunityTotalAttendanceChart } from './community-total-attendance-chart';

interface DashboardMetricsProps {
  data: DashboardData;
  showCompare?: boolean;
  isSingleMonth?: boolean;
  extendedLoading?: boolean;
  engagementLoading?: boolean;
}

function LoadingSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className={`flex items-center justify-center text-muted-foreground`} style={{ height }}>
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading...
      </div>
    </div>
  );
}

export function DashboardMetrics({ data, showCompare = true, isSingleMonth = false, extendedLoading = false, engagementLoading = false }: DashboardMetricsProps) {
  return (
    <div className="space-y-10">
      {/* Engagement Venn Diagram */}
      <Card>
        <CardHeader>
          <CardTitle>Engagement Overview</CardTitle>
          <CardDescription>People engaged across three dimensions: activity attendance, communities &amp; groups, and serving/leading</CardDescription>
        </CardHeader>
        <CardContent>
          {engagementLoading ? <LoadingSkeleton /> : (
            <VennDiagram
              data={data.engagementOverlap}
              averageTotalAttendance={data.currentPeriod.averageInPersonAttendance + data.currentPeriod.averageOnlineAttendance}
            />
          )}
        </CardContent>
      </Card>

      {/* ============================================================ */}
      {/* Section 1: Know God */}
      {/* ============================================================ */}
      <SectionWrapper title="Know God">
        {/* Metric Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
            title="Baptisms"
            value={data.baptismsCurrentPeriod}
            previousValue={showCompare ? data.baptismsPreviousPeriod : undefined}
            format="number"
          />
          <MetricCard
            title="New Members"
            value={data.membershipCurrentPeriod}
            previousValue={showCompare ? data.membershipPreviousPeriod : undefined}
            format="number"
          />
          {extendedLoading ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unique Event Participants</CardTitle>
              </CardHeader>
              <CardContent><LoadingSkeleton height={60} /></CardContent>
            </Card>
          ) : (
            <MetricCard
              title="Unique Event Participants"
              value={data.uniqueEventParticipants}
              format="number"
            />
          )}
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
      </SectionWrapper>

      {/* ============================================================ */}
      {/* Section 2: Feed Your Soul */}
      {/* ============================================================ */}
      <SectionWrapper title="Feed Your Soul">
        {/* Community Attendance — total across all communities */}
        <Card>
          <CardHeader>
            <CardTitle>Community Attendance</CardTitle>
            <CardDescription>
              {isSingleMonth ? 'Weekly total attendance across all communities' : `Monthly total attendance across all communities${showCompare ? ' comparison' : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExpandableChart
              title="Community Attendance"
              description={isSingleMonth ? 'Weekly total attendance' : `Monthly total attendance${showCompare ? ' comparison' : ''}`}
              expandedChildren={
                <CommunityTotalAttendanceChart
                  currentYear={data.communityAttendanceTrends}
                  previousYear={showCompare ? data.previousYearCommunityAttendanceTrends : []}
                  height={600}
                />
              }
            >
              <CommunityTotalAttendanceChart
                currentYear={data.communityAttendanceTrends}
                previousYear={showCompare ? data.previousYearCommunityAttendanceTrends : []}
              />
            </ExpandableChart>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Community Sunday Gathering — per-community breakdown */}
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
              {extendedLoading ? <LoadingSkeleton /> : (
                <ExpandableChart
                  title="Roster vs Attendance"
                  description="Comparison of people on group rosters vs people who attended events"
                  expandedChildren={
                    <RosterVsAttendanceChart data={data.rosterVsAttendance} height={600} />
                  }
                >
                  <RosterVsAttendanceChart data={data.rosterVsAttendance} />
                </ExpandableChart>
              )}
            </CardContent>
          </Card>
        </div>
      </SectionWrapper>

      {/* ============================================================ */}
      {/* Section 3: Grow in Love */}
      {/* ============================================================ */}
      <SectionWrapper title="Grow in Love">
        {extendedLoading ? (
          <Card>
            <CardContent className="pt-6">
              <LoadingSkeleton />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Serving Trends */}
            <Card>
              <CardHeader>
                <CardTitle>Serving Trends</CardTitle>
                <CardDescription>Monthly active servers and leaders{showCompare ? ' comparison' : ''}</CardDescription>
              </CardHeader>
              <CardContent>
                <ExpandableChart
                  title="Serving Trends"
                  description={`Monthly active servers and leaders${showCompare ? ' comparison' : ''}`}
                  expandedChildren={
                    <ServingTrendsChart
                      data={data.servingTrends}
                      previousYear={showCompare ? data.previousYearServingTrends : []}
                      height={600}
                    />
                  }
                >
                  <ServingTrendsChart
                    data={data.servingTrends}
                    previousYear={showCompare ? data.previousYearServingTrends : []}
                  />
                </ExpandableChart>
              </CardContent>
            </Card>

            {/* Serving metrics — second row */}
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

            {/* Where People Serve — full width */}
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
          </>
        )}
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

    </div>
  );
}
