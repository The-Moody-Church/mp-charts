import { cacheLife, cacheTag } from 'next/cache';
import { DashboardService } from '@/services/dashboardService';
import { DashboardData } from '@/lib/dto';
import { serviceCache, CACHE_TTL } from '@/lib/service-cache';

/**
 * Cached dashboard data for a single ministry year.
 * Revalidates every 6 hours; serves stale data for up to 24 hours while
 * the fresh value is computed in the background (stale-while-revalidate).
 *
 * Uses serviceCache as a safety net — guarantees instant responses even if
 * the 'use cache' framework blocks or misses. See src/lib/service-cache.ts.
 *
 * NOTE: If you add a new 'use cache' function here, you MUST also register it
 * in src/lib/cache-warming.ts so it is pre-warmed on container start.
 * See the "Cache Warming" section in CLAUDE.md.
 */
export async function getCachedDashboardData(ministryYear: number): Promise<DashboardData> {
  'use cache';
  cacheLife({ revalidate: 21600, stale: 86400 });
  cacheTag('dashboard-data', `year-${ministryYear}`);

  const key = `dashboard-data:${ministryYear}`;
  return serviceCache.getOrFetch(key, CACHE_TTL.STANDARD, async () => {
    // Ministry year runs Sept 1 - Aug 31
    const startDate = new Date(ministryYear, 8, 1); // September 1
    const endDate = new Date(ministryYear + 1, 7, 31); // August 31 of next calendar year

    const dashboardService = await DashboardService.getInstance();
    return dashboardService.getDashboardData(startDate, endDate);
  });
}

/**
 * Cached full-range dashboard data for 5 ministry years.
 * Revalidates every 6 hours; serves stale for up to 24 hours (stale-while-revalidate).
 * Cache key uses end-of-ministry-year (Aug 31) — stable within a ministry year,
 * so stale data survives container restarts and midnight rollovers.
 * The service methods cap month iteration at today internally.
 */
export async function getCachedFullRangeData(earliestYear: number, endDateIso: string): Promise<DashboardData> {
  'use cache';
  cacheLife({ revalidate: 21600, stale: 86400 });
  cacheTag('dashboard-data', 'dashboard-full-range');

  const key = `dashboard-full-range:${earliestYear}:${endDateIso}`;
  return serviceCache.getOrFetch(key, CACHE_TTL.STANDARD, async () => {
    const startDate = new Date(earliestYear, 8, 1); // September 1, 5 years ago
    const [year, month, day] = endDateIso.split('-').map(Number);
    const endDate = new Date(year, month - 1, day);

    const dashboardService = await DashboardService.getInstance();
    return dashboardService.getDashboardData(startDate, endDate);
  });
}

/**
 * Cached extended dashboard data (heavy queries) loaded separately.
 * Revalidates every 6 hours; serves stale for up to 24 hours (stale-while-revalidate).
 * Cache key is the full-range start/end dates (stable within a ministry year),
 * so stale data survives container restarts until the next revalidation.
 * Date-filterable data (event participants, roster/attendance) uses the full
 * selectable range so filterDashboardData can recompute on the client.
 */
export async function getCachedExtendedData(
  fullRangeStartIso: string,
  fullRangeEndIso: string
): Promise<Partial<DashboardData>> {
  'use cache';
  cacheLife({ revalidate: 21600, stale: 86400 });
  cacheTag('dashboard-data', 'dashboard-extended');

  const key = `dashboard-extended:${fullRangeStartIso}:${fullRangeEndIso}`;
  return serviceCache.getOrFetch(key, CACHE_TTL.STANDARD, async () => {
    const [startYear, startMonth, startDay] = fullRangeStartIso.split('-').map(Number);
    const [endYear, endMonth, endDay] = fullRangeEndIso.split('-').map(Number);

    const dashboardService = await DashboardService.getInstance();
    return dashboardService.getExtendedDashboardData(
      new Date(startYear, startMonth - 1, startDay),
      new Date(endYear, endMonth - 1, endDay)
    );
  });
}

/**
 * Cached engagement venn data (Activity_Log query — slowest query) loaded last.
 * Revalidates every 6 hours; serves stale for up to 24 hours (stale-while-revalidate).
 * Separated from extended data so serving/roster/EP charts can render first.
 * Cache key is the full-range start/end dates (stable within a ministry year).
 */
export async function getCachedEngagementData(
  fullRangeStartIso: string,
  fullRangeEndIso: string
): Promise<Partial<DashboardData>> {
  'use cache';
  cacheLife({ revalidate: 21600, stale: 86400 });
  cacheTag('dashboard-data', 'dashboard-engagement');

  const key = `dashboard-engagement:${fullRangeStartIso}:${fullRangeEndIso}`;
  return serviceCache.getOrFetch(key, CACHE_TTL.STANDARD, async () => {
    const [startYear, startMonth, startDay] = fullRangeStartIso.split('-').map(Number);
    const [endYear, endMonth, endDay] = fullRangeEndIso.split('-').map(Number);

    const dashboardService = await DashboardService.getInstance();
    return dashboardService.getEngagementDashboardData(
      new Date(startYear, startMonth - 1, startDay),
      new Date(endYear, endMonth - 1, endDay)
    );
  });
}
