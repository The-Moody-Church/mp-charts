import { Suspense } from 'react';
import { connection } from 'next/server';
import { getFullRangeDashboardMetrics } from '@/components/dashboard/actions';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

const BUILD_ID = 'cache-components-v1';

export default function DashboardPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Suspense fallback={
        <div className="text-muted-foreground">Loading dashboard...</div>
      }>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  // Signal that this component depends on the incoming request — skip build-time
  // prerender (API credentials aren't available during build). With PPR, the outer
  // page shell renders as static HTML and this streams in at request time.
  await connection();

  const dashboardData = await getFullRangeDashboardMetrics();
  return (
    <>
      {process.env.NODE_ENV === 'development' && (
        <div className="mb-4 rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-xs text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">
          <strong>Build:</strong> {BUILD_ID} | <strong>Rendered:</strong> {new Date().toISOString()}
        </div>
      )}
      <DashboardShell initialData={dashboardData} />
    </>
  );
}
