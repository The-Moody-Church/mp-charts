'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DashboardData } from '@/lib/dto';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from './metric-card';
import { AttendanceChart } from './attendance-chart';

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

function EngagementOverviewCard({ data, engagementLoading }: { data: DashboardData; engagementLoading: boolean }) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engagement Overview</CardTitle>
        <CardDescription className="space-y-2">
          <button
            type="button"
            onClick={() => setDetailsOpen(prev => !prev)}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
          >
            <span>Unique adults (18+ or unknown birthdate) engaged across three dimensions</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          </button>

          {detailsOpen && (
            <div className="text-sm text-muted-foreground space-y-3 pt-1 border-t">
              <div>
                <p className="font-medium text-foreground">Any Activity (Red)</p>
                <p>Any individual with at least one Activity Log entry during the selected period. This includes event participation (registered or attended), completed milestones, submitted responses (contact cards, volunteer responses), form responses (registrations, applications), donations, etc. Group Participant activity logs are excluded because it is possible to be on a group roster and have no engagement during that period.</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Communities &amp; Groups (Blue)</p>
                <p>Any individual who is on the group roster from Communities &amp; Groups (Ministry ID 8; includes Precepts and classes like it), Choir (Group ID 763; but not seasonal choir), and recurring Men&apos;s and Women&apos;s Ministry Groups (Ministry ID 14; 19).</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Serving / Leading (Yellow)</p>
                <p>Any individual with an active group role of type Serving or Leading during any part of the selected period.</p>
              </div>
              <div className="text-xs text-muted-foreground/80 italic">
                Overlap regions show individuals who appear in multiple dimensions.
              </div>
            </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {engagementLoading ? <LoadingSkeleton /> : (
          <VennDiagram
            data={data.engagementOverlap}
            averageTotalAttendance={data.currentPeriod.averageInPersonAttendance + data.currentPeriod.averageOnlineAttendance}
            averageInPersonAttendance={data.currentPeriod.averageInPersonAttendance}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardMetrics({ data, showCompare = true, isSingleMonth = false, extendedLoading = false, engagementLoading = false }: DashboardMetricsProps) {
  return (
    <div className="space-y-10">
      {/* Engagement Venn Diagram */}
      <EngagementOverviewCard
        data={data}
        engagementLoading={engagementLoading}
      />

      {/* ============================================================ */}
      {/* Section 1: Know God */}
      {/* ============================================================ */}
      <SectionWrapper title="Know God">
        {/* Metric Cards */}
        <div className="grid gap-4 md:grid-cols-4">
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
        <div className="grid gap-6 md:grid-cols-2">
          {/* Community Attendance — unique individuals across all communities */}
          <Card>
            <CardHeader>
              <CardTitle>Community Attendance</CardTitle>
              <CardDescription>
                {isSingleMonth ? 'Weekly unique individuals who checked in to a Community' : 'Monthly unique individuals who checked in to a Community'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExpandableChart
                title="Community Attendance"
                description={isSingleMonth ? 'Weekly unique individuals' : `Monthly unique individuals${showCompare ? ' comparison' : ''}`}
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

          {/* Community Sunday Gathering — per-community breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Community Sunday Gathering</CardTitle>
              <CardDescription>
                {isSingleMonth ? 'Weekly attendance by Community' : 'Average weekly attendance by Community'}
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

          {/* Communities and Groups Trends */}
          <Card>
            <CardHeader>
              <CardTitle>Communities and Groups Trends</CardTitle>
              <CardDescription>Monthly active groups in the Communities and Groups Ministry by group type</CardDescription>
            </CardHeader>
            <CardContent>
              <ExpandableChart
                title="Communities and Groups Trends"
                description="Monthly active groups in the Communities and Groups Ministry by group type"
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

          {/* Roster vs Attendance */}
          <Card>
            <CardHeader>
              <CardTitle>Roster vs Attendance</CardTitle>
              <CardDescription>Unique people on group rosters vs unique people who checked in to events</CardDescription>
            </CardHeader>
            <CardContent>
              {extendedLoading ? <LoadingSkeleton /> : (
                <ExpandableChart
                  title="Roster vs Attendance"
                  description="Unique people on group rosters vs unique people who checked in to events"
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
            <div className="grid gap-4 md:grid-cols-2">
              {/* Serving by Role Type (with total as header value) */}
              <Card>
                <CardHeader>
                  <CardTitle>Serving by Role Type</CardTitle>
                  <CardDescription>{data.totalServingLeading.toLocaleString()} unique people with an active Serving or Leading group role at any point during the selected period</CardDescription>
                </CardHeader>
                <CardContent>
                  <ServingByRoleTypeChart data={data.servingByRoleType} height={200} />
                </CardContent>
              </Card>

              {/* Where People Serve */}
              <Card>
                <CardHeader>
                  <CardTitle>Where People Serve</CardTitle>
                  <CardDescription>Unique people by the Ministry assigned to their group role. One person serving in multiple ministries is counted in each. &quot;Other&quot; includes roles without an assigned Ministry.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ExpandableChart
                    title="Where People Serve"
                    description="Unique people by the Ministry assigned to their group role"
                    expandedChildren={
                      <ServingByMinistryChart data={data.servingByMinistry} height={600} />
                    }
                  >
                    <ServingByMinistryChart data={data.servingByMinistry} />
                  </ExpandableChart>
                </CardContent>
              </Card>
            </div>

            {/* Serving Trends — full width */}
            <Card>
              <CardHeader>
                <CardTitle>Serving Trends</CardTitle>
                <CardDescription>Unique people with an active Serving or Leading group role in each month{showCompare ? ', compared to the same months in the previous year' : ''}</CardDescription>
              </CardHeader>
              <CardContent>
                <ExpandableChart
                  title="Serving Trends"
                  description={`Unique people with an active Serving or Leading group role in each month${showCompare ? ', compared to the same months in the previous year' : ''}`}
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
          </>
        )}
      </SectionWrapper>


    </div>
  );
}
