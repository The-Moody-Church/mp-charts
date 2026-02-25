'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';
import { ServingTrend, ServingByRoleType, ServingByMinistry } from '@/lib/dto';
import { useIsMobile } from '@/hooks/use-mobile';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// ---------------------------------------------------------------
// Serving Trends (line chart)
// ---------------------------------------------------------------

interface ServingTrendsChartProps {
  data: ServingTrend[];
  height?: number;
}

export function ServingTrendsChart({ data, height = 300 }: ServingTrendsChartProps) {
  const isMobile = useIsMobile();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height: 300 }}>
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
      <LineChart data={chartData} margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? 5 : 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 12 }} />
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
  const isMobile = useIsMobile();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height: 300 }}>
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
          label={isMobile ? false : ({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
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
  const isMobile = useIsMobile();

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height: 300 }}>
        No ministry data available
      </div>
    );
  }

  // Take top 10 ministries, truncate more aggressively on mobile
  const maxLabelLen = isMobile ? 15 : 25;
  const chartData = data.slice(0, 10).map(d => ({
    name: d.ministryName.length > maxLabelLen ? d.ministryName.slice(0, maxLabelLen - 3) + '...' : d.ministryName,
    fullName: d.ministryName,
    People: d.uniqueContacts,
  }));

  const dynamicHeight = Math.max(height, chartData.length * 35 + 60);

  return (
    <ResponsiveContainer width="100%" height={dynamicHeight}>
      <BarChart data={chartData} layout="vertical" margin={{ left: isMobile ? 5 : 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={isMobile ? 80 : 150} />
        <Tooltip
          trigger={isMobile ? 'click' : 'hover'}
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            maxWidth: '85vw',
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
