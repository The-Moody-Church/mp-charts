import { getDashboardMetrics } from '@/components/dashboard/actions';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

// Revalidate the dashboard data every 6 hours (21600 seconds)
// This provides 4 refresh windows per day: 12am, 6am, 12pm, 6pm
// Using ISR (Incremental Static Regeneration) - page is cached and revalidated every 6 hours
export const revalidate = 21600;

export default async function DashboardPage() {
  // Fetch default ministry year data on server for fast initial load
  const dashboardData = await getDashboardMetrics();

  return (
    <div className="container mx-auto p-8">
      <DashboardShell initialData={dashboardData} />
    </div>
  );
}
