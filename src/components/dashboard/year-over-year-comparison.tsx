'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { YearOverYearMetrics } from '@/lib/dto';

interface YearOverYearComparisonProps {
  data: YearOverYearMetrics[];
}

export function YearOverYearComparison({ data }: YearOverYearComparisonProps) {
  const chartData = data.map(item => ({
    metric: item.metric,
    'Current Year': item.currentYear,
    'Previous Year': item.previousYear
  }));

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No year-over-year comparison data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" className="text-xs" />
        <YAxis dataKey="metric" type="category" width={150} className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px'
          }}
        />
        <Legend />
        <Bar dataKey="Current Year" fill="#3b82f6" />
        <Bar dataKey="Previous Year" fill="#94a3b8" />
      </BarChart>
    </ResponsiveContainer>
  );
}
