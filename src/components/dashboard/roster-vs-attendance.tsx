'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RosterVsAttendance as RosterVsAttendanceData } from '@/lib/dto';

interface RosterVsAttendanceChartProps {
  data: RosterVsAttendanceData[];
  height?: number;
}

export function RosterVsAttendanceChart({ data, height = 300 }: RosterVsAttendanceChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No roster/attendance data available
      </div>
    );
  }

  const chartData = data.map(d => ({
    name: d.groupTypeName,
    Roster: d.rosterCount,
    Attendance: d.attendanceCount,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
          }}
        />
        <Legend />
        <Bar dataKey="Roster" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Attendance" fill="#10b981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
