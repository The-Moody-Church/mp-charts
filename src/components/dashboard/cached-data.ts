import { cacheLife, cacheTag } from 'next/cache';
import { DashboardService } from '@/services/dashboardService';
import { DashboardData } from '@/lib/dto';
import { serviceCache, CACHE_TTL } from '@/lib/service-cache';

/**
 * Dashboard reads, in two layers (.claude/rules/caching.md):
 *
 * - `load*` functions: the serviceCache layer. Each wraps one DashboardService
 *   call in serviceCache.getOrFetch. refreshDashboardCache (actions.ts) calls
 *   these directly, so it learns whether each forced MP fetch succeeded BEFORE it
 *   expires any 'use cache' tag (see the note there).
 * - `getCached*` functions: the 'use cache' layer, each a thin wrapper around its
 *   loader with the same key.
 *
 * NOTE: If you add a new 'use cache' function here, you MUST also register it
 * in src/lib/cache-warming.ts so it is pre-warmed on container start.
 * See the "Cache Warming" section in CLAUDE.md.
 */

/** Parses a 'YYYY-MM-DD' key as a local-constructor Date naming that calendar day. */
function localDay(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * serviceCache layer of the full-range core data (5 ministry years).
 * The service methods cap month iteration at today internally.
 */
export function loadFullRangeData(earliestYear: number, endDateIso: string): Promise<DashboardData> {
  const key = `dashboard-full-range:${earliestYear}:${endDateIso}`;
  return serviceCache.getOrFetch(key, CACHE_TTL.STANDARD, async () => {
    const startDate = new Date(earliestYear, 8, 1); // September 1, 5 years ago
    // Inclusive calendar day (Aug 31): the service queries `< Sep 1 00:00` Central.
    const endDate = localDay(endDateIso);

    const dashboardService = await DashboardService.getInstance();
    return dashboardService.getDashboardData(startDate, endDate);
  });
}

/** serviceCache layer of the extended data (event participants, roster, serving). */
export function loadExtendedData(
  fullRangeStartIso: string,
  fullRangeEndIso: string
): Promise<Partial<DashboardData>> {
  const key = `dashboard-extended:${fullRangeStartIso}:${fullRangeEndIso}`;
  return serviceCache.getOrFetch(key, CACHE_TTL.STANDARD, async () => {
    const dashboardService = await DashboardService.getInstance();
    return dashboardService.getExtendedDashboardData(localDay(fullRangeStartIso), localDay(fullRangeEndIso));
  });
}

/** serviceCache layer of the engagement venn data (Activity_Log, the slowest read). */
export function loadEngagementData(
  fullRangeStartIso: string,
  fullRangeEndIso: string
): Promise<Partial<DashboardData>> {
  const key = `dashboard-engagement:${fullRangeStartIso}:${fullRangeEndIso}`;
  return serviceCache.getOrFetch(key, CACHE_TTL.STANDARD, async () => {
    const dashboardService = await DashboardService.getInstance();
    return dashboardService.getEngagementDashboardData(localDay(fullRangeStartIso), localDay(fullRangeEndIso));
  });
}

/**
 * Cached full-range dashboard data for 5 ministry years.
 * Revalidates every 6 hours, serving the old value while it regenerates. No hard
 * expiry: `stale` is the client router's (see .claude/rules/caching.md).
 * Cache key uses end-of-ministry-year (Aug 31) — stable within a ministry year,
 * so stale data survives midnight rollovers.
 */
export async function getCachedFullRangeData(earliestYear: number, endDateIso: string): Promise<DashboardData> {
  'use cache';
  cacheLife({ revalidate: 21600, stale: 86400 });
  cacheTag('dashboard-data', 'dashboard-full-range');
  return loadFullRangeData(earliestYear, endDateIso);
}

/**
 * Cached extended dashboard data (heavy queries) loaded separately.
 * Revalidates every 6 hours, serving the old value while it regenerates. No hard
 * expiry: `stale` is the client router's (see .claude/rules/caching.md).
 * Cache key is the full-range start/end dates (stable within a ministry year).
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
  return loadExtendedData(fullRangeStartIso, fullRangeEndIso);
}

/**
 * Cached engagement venn data (Activity_Log query — slowest query) loaded last.
 * Revalidates every 6 hours, serving the old value while it regenerates. No hard
 * expiry: `stale` is the client router's (see .claude/rules/caching.md).
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
  return loadEngagementData(fullRangeStartIso, fullRangeEndIso);
}
