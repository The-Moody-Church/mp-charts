'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { YearOverYearMetrics } from '@/lib/dto';
import { useIsMobile } from '@/hooks/use-mobile';

interface YearOverYearComparisonProps {
  data: YearOverYearMetrics[];
}

export function YearOverYearComparison({ data }: YearOverYearComparisonProps) {
  const isMobile = useIsMobile();

  const chartData = data.map(item => ({
    metric: item.metric,
    'Current Period': item.currentYear,
    'Previous Period': item.previousYear
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height: 300 }}>
        No year-over-year comparison data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" className="text-xs" />
        <YAxis dataKey="metric" type="category" width={isMobile ? 80 : 150} className="text-xs" />
        <Tooltip
          trigger={isMobile ? 'click' : 'hover'}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            maxWidth: '85vw',
          }}
        />
        {!isMobile && <Legend />}
        <Bar dataKey="Current Period" fill="#3b82f6" />
        <Bar dataKey="Previous Period" fill="#94a3b8" />
      </BarChart>
    </ResponsiveContainer>
  );
}
