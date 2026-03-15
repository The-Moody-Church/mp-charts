'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { SmallGroupTrend } from '@/lib/dto';
import { useIsMobile } from '@/hooks/use-mobile';

interface SmallGroupTrendsProps {
  data: SmallGroupTrend[];
  previousYear?: SmallGroupTrend[];
  height?: number;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// Ministry year month ordering for chart X-axis
const MONTH_ORDER = [
  'September', 'October', 'November', 'December',
  'January', 'February', 'March', 'April', 'May',
  'June', 'July', 'August'
];

/** Format a YYYY-MM key into a short display label like "Feb '26" */
function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  const mon = date.toLocaleDateString('en-US', { month: 'short' });
  const yr = date.toLocaleDateString('en-US', { year: '2-digit' });
  return `${mon} '${yr}`;
}

export function SmallGroupTrends({ data, previousYear = [], height = 300 }: SmallGroupTrendsProps) {
  const isMobile = useIsMobile();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        No small group trend data available
      </div>
    );
  }

  // Extract all unique group type names from current year data, sorted by average count (largest first in legend)
  const typeTotals = new Map<string, { sum: number; count: number }>();
  data.forEach(month => {
    Object.entries(month.groupCountByType).forEach(([typeName, count]) => {
      const current = typeTotals.get(typeName) || { sum: 0, count: 0 };
      typeTotals.set(typeName, { sum: current.sum + count, count: current.count + 1 });
    });
  });

  const sortedTypeNames = Array.from(typeTotals.entries())
    .map(([name, totals]) => ({ name, average: totals.sum / totals.count }))
    .sort((a, b) => b.average - a.average)
    .map(item => item.name);

  const hasPrevious = previousYear.length > 0;

  // Build chart data: merge current and previous year by monthName
  const monthsMap = new Map<string, Record<string, unknown>>();

  data.forEach(item => {
    const entry: Record<string, unknown> = {
      name: formatMonthLabel(item.month),
      mergeKey: item.monthName,
    };
    for (const [typeName, count] of Object.entries(item.groupCountByType)) {
      entry[typeName] = count;
    }
    entry.total = item.activeGroupCount;
    monthsMap.set(item.monthName, entry);
  });

  // Merge previous year data (prefixed keys)
  if (hasPrevious) {
    previousYear.forEach(item => {
      const existing = monthsMap.get(item.monthName);
      if (existing) {
        for (const [typeName, count] of Object.entries(item.groupCountByType)) {
          existing[`prev_${typeName}`] = count;
        }
        existing.prev_total = item.activeGroupCount;
      } else {
        const entry: Record<string, unknown> = {
          name: formatMonthLabel(item.month),
          mergeKey: item.monthName,
          previousOnly: true,
        };
        for (const [typeName, count] of Object.entries(item.groupCountByType)) {
          entry[`prev_${typeName}`] = count;
        }
        entry.prev_total = item.activeGroupCount;
        monthsMap.set(item.monthName, entry);
      }
    });
  }

  // Sort by ministry year order
  const chartData = Array.from(monthsMap.values()).sort((a, b) => {
    return MONTH_ORDER.indexOf(a.mergeKey as string) - MONTH_ORDER.indexOf(b.mergeKey as string);
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? 5 : 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          className="text-xs"
          padding={{ left: isMobile ? 5 : 20, right: isMobile ? 5 : 20 }}
          tickFormatter={(value: string, index: number) => {
            const entry = chartData[index];
            return entry?.previousOnly ? `*${value}*` : value;
          }}
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
        {sortedTypeNames.map((typeName, index) => (
          <Line
            key={typeName}
            type="monotone"
            dataKey={typeName}
            stroke={CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={2}
            connectNulls
            name={hasPrevious ? `${typeName} (Current)` : typeName}
          />
        ))}
        <Line
          key="total"
          type="monotone"
          dataKey="total"
          stroke="#000000"
          strokeWidth={2}
          connectNulls
          name={hasPrevious ? 'Total (Current)' : 'Total'}
        />
        {hasPrevious && (
          <Line
            key="prev_total"
            type="monotone"
            dataKey="prev_total"
            stroke="#000000"
            strokeWidth={2}
            strokeDasharray="5 5"
            connectNulls
            name="Total (Previous)"
          />
        )}
        {hasPrevious && sortedTypeNames.map((typeName, index) => (
          <Line
            key={`prev_${typeName}`}
            type="monotone"
            dataKey={`prev_${typeName}`}
            stroke={CHART_COLORS[index % CHART_COLORS.length]}
            strokeWidth={2}
            strokeDasharray="5 5"
            connectNulls
            name={`${typeName} (Previous)`}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
