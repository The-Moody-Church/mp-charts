'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';
import { ServingTrend, ServingByRoleType, ServingByMinistry } from '@/lib/dto';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ---------------------------------------------------------------
// Serving Trends (line chart)
// ---------------------------------------------------------------

interface ServingTrendsChartProps {
  data: ServingTrend[];
  height?: number;
}

export function ServingTrendsChart({ data, height = 300 }: ServingTrendsChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No serving trend data available
      </div>
    );
  }

  const chartData = data.map(d => ({
    name: new Date(d.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    Serving: d.servingCount,
    Leading: d.leadingCount,
    Total: d.totalCount,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
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
        <Line type="monotone" dataKey="Serving" stroke="#3b82f6" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Leading" stroke="#f59e0b" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Total" stroke="#6b7280" strokeWidth={1} strokeDasharray="5 5" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------
// Serving by Role Type (pie chart)
// ---------------------------------------------------------------

interface ServingByRoleTypeChartProps {
  data: ServingByRoleType[];
  height?: number;
}

export function ServingByRoleTypeChart({ data, height = 300 }: ServingByRoleTypeChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No role type data available
      </div>
    );
  }

  const chartData = data.map(d => ({
    name: d.roleTypeName,
    value: d.uniqueContacts,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------
// Serving by Ministry (horizontal bar chart)
// ---------------------------------------------------------------

interface ServingByMinistryChartProps {
  data: ServingByMinistry[];
  height?: number;
}

export function ServingByMinistryChart({ data, height = 300 }: ServingByMinistryChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No ministry data available
      </div>
    );
  }

  // Take top 10 ministries
  const chartData = data.slice(0, 10).map(d => ({
    name: d.ministryName.length > 25 ? d.ministryName.slice(0, 22) + '...' : d.ministryName,
    fullName: d.ministryName,
    People: d.uniqueContacts,
  }));

  const dynamicHeight = Math.max(height, chartData.length * 35 + 60);

  return (
    <ResponsiveContainer width="100%" height={dynamicHeight}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={150} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
          }}
          formatter={(value: number | undefined) => [(value ?? 0).toLocaleString(), 'People']}
          labelFormatter={(label) => {
            const item = chartData.find(d => d.name === String(label));
            return item?.fullName || String(label);
          }}
        />
        <Bar dataKey="People" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
