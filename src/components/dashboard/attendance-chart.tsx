'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { EventTypeMetrics } from '@/lib/dto';

interface AttendanceChartProps {
  data: EventTypeMetrics[];
}

export function AttendanceChart({ data }: AttendanceChartProps) {
  const chartData = data.map(item => ({
    name: item.eventTypeName,
    average: item.averageAttendance,
    unique: item.uniqueAttendees
  }));

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No event attendance data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="name"
          angle={-45}
          textAnchor="end"
          height={100}
          className="text-xs"
        />
        <YAxis className="text-xs" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px'
          }}
        />
        <Legend />
        <Bar dataKey="average" fill="#3b82f6" name="Avg Attendance" />
        <Bar dataKey="unique" fill="#10b981" name="Unique Attendees" />
      </BarChart>
    </ResponsiveContainer>
  );
}
