'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MonthlyAttendanceTrend } from '@/lib/dto';
import { useIsMobile } from '@/hooks/use-mobile';

interface AttendanceChartProps {
  currentYear: MonthlyAttendanceTrend[];
  previousYear: MonthlyAttendanceTrend[];
  height?: number;
}

export function AttendanceChart({ currentYear, previousYear, height = 300 }: AttendanceChartProps) {
  const isMobile = useIsMobile();

  // Filter out months with 0 average and combine data by month name
  const currentFiltered = currentYear.filter(item => item.averageTotalAttendance > 0);
  const previousFiltered = previousYear.filter(item => item.averageTotalAttendance > 0);

  // Detect if this is weekly data (month field is a date YYYY-MM-DD instead of YYYY-MM)
  const isWeekly = currentFiltered.length > 0 && currentFiltered[0].month.length > 7;

  /** Format a YYYY-MM or YYYY-MM-DD sort key into a short display label */
  const formatLabel = (sortKey: string, monthName: string): string => {
    if (isWeekly) return monthName; // Already "Feb 1" etc. from dateLabel
    const [y, m] = sortKey.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  // Create a map of all unique data points (keyed by monthName for merging)
  const monthsMap = new Map<string, {
    name: string;       // display label for X-axis
    mergeKey: string;   // monthName used for current/previous year matching
    sortKey: string;
    currentInPerson?: number;
    currentOnline?: number;
    currentTotal?: number;
    previousInPerson?: number;
    previousOnline?: number;
    previousTotal?: number;
  }>();

  // Add current year data
  currentFiltered.forEach(item => {
    monthsMap.set(item.monthName, {
      name: formatLabel(item.month, item.monthName),
      mergeKey: item.monthName,
      sortKey: item.month, // YYYY-MM for monthly, YYYY-MM-DD for weekly
      currentInPerson: item.averageInPersonAttendance,
      currentOnline: item.averageOnlineAttendance,
      currentTotal: item.averageTotalAttendance
    });
  });

  // Add previous year data
  if (!isWeekly) {
    // For monthly data, merge by month name (e.g., "February" matches across years)
    previousFiltered.forEach(item => {
      const existing = monthsMap.get(item.monthName);
      if (existing) {
        existing.previousInPerson = item.averageInPersonAttendance;
        existing.previousOnline = item.averageOnlineAttendance;
        existing.previousTotal = item.averageTotalAttendance;
      } else {
        monthsMap.set(item.monthName, {
          name: formatLabel(item.month, item.monthName),
          mergeKey: item.monthName,
          sortKey: item.month,
          previousInPerson: item.averageInPersonAttendance,
          previousOnline: item.averageOnlineAttendance,
          previousTotal: item.averageTotalAttendance
        });
      }
    });
  } else {
    // For weekly data, merge previous year dates by month-day (MM-DD)
    previousFiltered.forEach(item => {
      const dayKey = item.month.slice(5); // MM-DD
      // Check if a current year entry shares this month-day
      const existingEntry = Array.from(monthsMap.values()).find(e => e.sortKey.slice(5) === dayKey);
      if (existingEntry) {
        existingEntry.previousInPerson = item.averageInPersonAttendance;
        existingEntry.previousOnline = item.averageOnlineAttendance;
        existingEntry.previousTotal = item.averageTotalAttendance;
      } else {
        const key = `prev-${item.month}`;
        monthsMap.set(key, {
          name: formatLabel(item.month, item.monthName),
          mergeKey: key,
          sortKey: item.month,
          previousInPerson: item.averageInPersonAttendance,
          previousOnline: item.averageOnlineAttendance,
          previousTotal: item.averageTotalAttendance,
        });
      }
    });
  }

  // Check if any previous year data was merged in
  const hasPrevious = Array.from(monthsMap.values()).some(d => d.previousTotal != null);

  // Sort: by ministry year order for monthly data, chronologically for weekly
  const monthOrder = ['September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'];
  const chartData = Array.from(monthsMap.values()).sort((a, b) => {
    if (isWeekly) {
      // Sort by month-day only (strip year) so current & previous year dates interleave
      return a.sortKey.slice(5).localeCompare(b.sortKey.slice(5));
    }
    return monthOrder.indexOf(a.mergeKey) - monthOrder.indexOf(b.mergeKey);
  });

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        No attendance data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? 5 : 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          className="text-xs"
          padding={{ left: isMobile ? 5 : 20, right: isMobile ? 5 : 20 }}
        />
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
        <Line dataKey="currentInPerson" stroke="#3b82f6" strokeWidth={2} connectNulls name={hasPrevious ? 'In-Person (Current)' : 'In-Person'} />
        {hasPrevious && <Line dataKey="previousInPerson" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" connectNulls name="In-Person (Previous)" />}
        <Line dataKey="currentOnline" stroke="#10b981" strokeWidth={2} connectNulls name={hasPrevious ? 'Online (Current)' : 'Online'} />
        {hasPrevious && <Line dataKey="previousOnline" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" connectNulls name="Online (Previous)" />}
        <Line dataKey="currentTotal" stroke="#f59e0b" strokeWidth={2} connectNulls name={hasPrevious ? 'Total (Current)' : 'Total'} />
        {hasPrevious && <Line dataKey="previousTotal" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" connectNulls name="Total (Previous)" />}
      </LineChart>
    </ResponsiveContainer>
  );
}
