'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CommunityAttendanceTrend } from '@/lib/dto';
import { useIsMobile } from '@/hooks/use-mobile';

interface CommunityTotalAttendanceChartProps {
  currentYear: CommunityAttendanceTrend[];
  previousYear: CommunityAttendanceTrend[];
  height?: number;
}

/**
 * Aggregate CommunityAttendanceTrend[] into monthly unique participant counts.
 * Uses the pre-computed uniqueParticipants field (deduped across all groups).
 */
function aggregateToMonthlyTotals(data: CommunityAttendanceTrend[]): { month: string; monthName: string; total: number }[] {
  // Monthly data already has one entry per month with uniqueParticipants set
  return data.map(entry => {
    const [y, m] = entry.weekStartDate.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return {
      month: entry.weekStartDate.slice(0, 7),
      monthName: date.toLocaleDateString('en-US', { month: 'long' }),
      total: entry.uniqueParticipants,
    };
  });
}

/**
 * For weekly data (single month), use unique participant counts per week.
 */
function aggregateWeeklyTotals(data: CommunityAttendanceTrend[]): { date: string; dateLabel: string; total: number }[] {
  return data.map(week => {
    const [y, m, d] = week.weekStartDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return {
      date: week.weekStartDate,
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      total: week.uniqueParticipants,
    };
  });
}

export function CommunityTotalAttendanceChart({ currentYear, previousYear, height = 300 }: CommunityTotalAttendanceChartProps) {
  const isMobile = useIsMobile();

  if (currentYear.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        No community attendance data available
      </div>
    );
  }

  // Detect if weekly granularity (multiple entries within same month)
  const monthKeys = new Set(currentYear.map(w => w.weekStartDate.slice(0, 7)));
  const isWeekly = currentYear.length > monthKeys.size;
  const showComparison = previousYear.length > 0;

  if (isWeekly) {
    // Weekly view — interleave current & previous year dates on same axis
    const currentWeekly = aggregateWeeklyTotals(currentYear);
    const previousWeekly = showComparison ? aggregateWeeklyTotals(previousYear) : [];

    // Build merged dataset keyed by month-day so same-day entries combine
    const mergedMap = new Map<string, { name: string; daySortKey: string; currentTotal?: number; previousTotal?: number }>();
    for (const w of currentWeekly) {
      const key = w.date.slice(5); // MM-DD
      mergedMap.set(key, { name: w.dateLabel, daySortKey: key, currentTotal: w.total });
    }
    for (const w of previousWeekly) {
      const key = w.date.slice(5); // MM-DD
      const existing = mergedMap.get(key);
      if (existing) {
        existing.previousTotal = w.total;
      } else {
        mergedMap.set(key, { name: w.dateLabel, daySortKey: key, previousTotal: w.total });
      }
    }
    const chartData = Array.from(mergedMap.values()).sort((a, b) => a.daySortKey.localeCompare(b.daySortKey));

    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? 5 : 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" className="text-xs" padding={{ left: isMobile ? 5 : 20, right: isMobile ? 5 : 20 }} />
          <YAxis className="text-xs" />
          <Tooltip
            trigger={isMobile ? 'click' : 'hover'}
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid rgba(0, 0, 0, 0.1)',
              borderRadius: '6px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              maxWidth: '85vw',
            }}
          />
          {!isMobile && <Legend />}
          <Line type="monotone" dataKey="currentTotal" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls name={showComparison ? 'Current Year' : 'Unique Individuals'} />
          {showComparison && (
            <Line type="monotone" dataKey="previousTotal" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls name="Previous Year" />
          )}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // Monthly view — merge current & previous by month name for YoY comparison
  const currentMonthly = aggregateToMonthlyTotals(currentYear);
  const previousMonthly = aggregateToMonthlyTotals(previousYear);

  const monthOrder = ['September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'];

  const monthsMap = new Map<string, {
    name: string;
    monthName: string;
    sortKey: string;
    currentTotal?: number;
    previousTotal?: number;
  }>();

  for (const item of currentMonthly) {
    const [y, m] = item.month.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    monthsMap.set(item.monthName, {
      name: label,
      monthName: item.monthName,
      sortKey: item.month,
      currentTotal: item.total,
    });
  }

  if (showComparison) {
    for (const item of previousMonthly) {
      const existing = monthsMap.get(item.monthName);
      if (existing) {
        existing.previousTotal = item.total;
      } else {
        const [y, m] = item.month.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        monthsMap.set(item.monthName, {
          name: label,
          monthName: item.monthName,
          sortKey: item.month,
          previousTotal: item.total,
        });
      }
    }
  }

  const chartData = Array.from(monthsMap.values()).sort(
    (a, b) => monthOrder.indexOf(a.monthName) - monthOrder.indexOf(b.monthName)
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? 5 : 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" className="text-xs" padding={{ left: isMobile ? 5 : 20, right: isMobile ? 5 : 20 }} />
        <YAxis className="text-xs" />
        <Tooltip
          trigger={isMobile ? 'click' : 'hover'}
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            maxWidth: '85vw',
          }}
        />
        {!isMobile && <Legend />}
        <Line type="monotone" dataKey="currentTotal" stroke="#3b82f6" strokeWidth={2} dot={false} name={showComparison ? 'Unique Participants (Current)' : 'Unique Participants'} />
        {showComparison && (
          <Line type="monotone" dataKey="previousTotal" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Unique Participants (Previous)" />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
