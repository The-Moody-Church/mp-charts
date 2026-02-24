'use server';

import { cacheLife, cacheTag, revalidatePath, revalidateTag } from 'next/cache';
import { requireSession } from '@/lib/auth-helpers';
import { enforceRateLimit } from '@/lib/rate-limit';
import { DashboardService } from '@/services/dashboardService';
import { DashboardData } from '@/lib/dto';

/**
 * Cached dashboard data for a single ministry year (6-hour cache)
 */
async function getCachedDashboardData(ministryYear: number): Promise<DashboardData> {
  'use cache';
  cacheLife({ revalidate: 21600 });
  cacheTag('dashboard-data', `year-${ministryYear}`);

  // Ministry year runs Sept 1 - Aug 31
  const startDate = new Date(ministryYear, 8, 1); // September 1
  const endDate = new Date(ministryYear + 1, 7, 31); // August 31 of next calendar year

  const dashboardService = await DashboardService.getInstance();
  return dashboardService.getDashboardData(startDate, endDate);
}

/**
 * Cached full-range dashboard data for 5 ministry years (6-hour cache).
 * The endDateIso parameter (YYYY-MM-DD) is computed by the caller so that
 * `new Date()` stays outside the cache boundary. The date string becomes part
 * of the automatic cache key, meaning the cache refreshes daily.
 */
async function getCachedFullRangeData(earliestYear: number, endDateIso: string): Promise<DashboardData> {
  'use cache';
  cacheLife({ revalidate: 21600 });
  cacheTag('dashboard-data', 'dashboard-full-range');

  const startDate = new Date(earliestYear, 8, 1); // September 1, 5 years ago
  const [year, month, day] = endDateIso.split('-').map(Number);
  const endDate = new Date(year, month - 1, day);

  const dashboardService = await DashboardService.getInstance();
  return dashboardService.getDashboardData(startDate, endDate);
}

/**
 * Fetches dashboard data for the specified ministry year
 * Defaults to current ministry year (Sept - Aug)
 * Data is cached for 6 hours and tagged for manual invalidation
 *
 * @param year - Optional ministry year (defaults to current)
 * @returns Promise<DashboardData> - Complete dashboard metrics
 */
export async function getDashboardMetrics(
  year?: number
): Promise<DashboardData> {
  const currentYear = year || getCurrentMinistryYear();
  return getCachedDashboardData(currentYear);
}

/**
 * Fetches dashboard data for the full selectable date range (5 ministry years).
 * All data is loaded once and filtered client-side when the user changes the filter.
 * Cached for 6 hours with manual invalidation support.
 *
 * @returns Promise<DashboardData> - Complete dashboard metrics for the full range
 */
export async function getFullRangeDashboardMetrics(): Promise<DashboardData> {
  const currentYear = getCurrentMinistryYear();
  const earliestYear = currentYear - 4;

  // Compute end date outside the cache boundary (new Date() is dynamic data)
  const today = new Date();
  const maxEnd = new Date(currentYear + 1, 7, 31);
  const endDate = today < maxEnd ? today : maxEnd;
  const endDateIso = endDate.toISOString().split('T')[0]; // "YYYY-MM-DD"

  return getCachedFullRangeData(earliestYear, endDateIso);
}

/**
 * Cached extended dashboard data (heavy queries) loaded separately.
 * Uses a date string cache key so it refreshes daily.
 * Date-filterable data (event participants, roster/attendance) uses the full
 * selectable range so filterDashboardData can recompute on the client.
 */
async function getCachedExtendedData(
  dateIso: string,
  fullRangeStartIso: string,
  fullRangeEndIso: string
): Promise<Partial<DashboardData>> {
  'use cache';
  cacheLife({ revalidate: 21600 });
  cacheTag('dashboard-data', 'dashboard-extended');

  // dateIso is used as cache key only — suppress unused lint
  void dateIso;

  const [startYear, startMonth, startDay] = fullRangeStartIso.split('-').map(Number);
  const [endYear, endMonth, endDay] = fullRangeEndIso.split('-').map(Number);

  const dashboardService = await DashboardService.getInstance();
  return dashboardService.getExtendedDashboardData(
    new Date(startYear, startMonth - 1, startDay),
    new Date(endYear, endMonth - 1, endDay)
  );
}

/**
 * Fetches extended dashboard data (engagement overlap, serving, roster metrics).
 * Called separately from core data so the page can render progressively.
 * Cached for 6 hours with manual invalidation support.
 */
export async function getExtendedDashboardMetrics(): Promise<Partial<DashboardData>> {
  const currentYear = getCurrentMinistryYear();
  const earliestYear = currentYear - 4;

  const today = new Date();
  const dateIso = today.toISOString().split('T')[0];

  const fullRangeStart = new Date(earliestYear, 8, 1); // September 1, 5 years ago
  const maxEnd = new Date(currentYear + 1, 7, 31);
  const fullRangeEnd = today < maxEnd ? today : maxEnd;

  return getCachedExtendedData(
    dateIso,
    fullRangeStart.toISOString().split('T')[0],
    fullRangeEnd.toISOString().split('T')[0]
  );
}

/**
 * Cached engagement venn data (Activity_Log query — slowest query) loaded last.
 * Separated from extended data so serving/roster/EP charts can render first.
 * Uses a date string cache key so it refreshes daily.
 */
async function getCachedEngagementData(
  dateIso: string,
  fullRangeStartIso: string,
  fullRangeEndIso: string
): Promise<Partial<DashboardData>> {
  'use cache';
  cacheLife({ revalidate: 21600 });
  cacheTag('dashboard-data', 'dashboard-engagement');

  // dateIso is used as cache key only — suppress unused lint
  void dateIso;

  const [startYear, startMonth, startDay] = fullRangeStartIso.split('-').map(Number);
  const [endYear, endMonth, endDay] = fullRangeEndIso.split('-').map(Number);

  const dashboardService = await DashboardService.getInstance();
  return dashboardService.getEngagementDashboardData(
    new Date(startYear, startMonth - 1, startDay),
    new Date(endYear, endMonth - 1, endDay)
  );
}

/**
 * Fetches engagement venn diagram data (Activity_Log — slowest query).
 * Loaded separately from extended data so other charts can render first.
 * Cached for 6 hours with manual invalidation support.
 */
export async function getEngagementDashboardMetrics(): Promise<Partial<DashboardData>> {
  const currentYear = getCurrentMinistryYear();
  const earliestYear = currentYear - 4;

  const today = new Date();
  const dateIso = today.toISOString().split('T')[0];

  const fullRangeStart = new Date(earliestYear, 8, 1);
  const maxEnd = new Date(currentYear + 1, 7, 31);
  const fullRangeEnd = today < maxEnd ? today : maxEnd;

  return getCachedEngagementData(
    dateIso,
    fullRangeStart.toISOString().split('T')[0],
    fullRangeEnd.toISOString().split('T')[0]
  );
}

/**
 * Determines current ministry year based on today's date
 * If before September, use previous calendar year
 * If September or later, use current calendar year
 *
 * @returns number - Current ministry year
 */
function getCurrentMinistryYear(): number {
  const today = new Date();
  const currentMonth = today.getMonth(); // 0-indexed (0 = Jan, 8 = Sept)

  return currentMonth >= 8
    ? today.getFullYear()
    : today.getFullYear() - 1;
}

/**
 * Manually refreshes the dashboard cache
 * Revalidates both page-level and data-level caches:
 * - Page-level: revalidates the dashboard page
 * - Data-level: invalidates dashboard-data and Group_Types caches
 *
 * @returns Promise<{ success: boolean; timestamp: Date }>
 */
export async function refreshDashboardCache(): Promise<{
  success: boolean;
  timestamp: Date;
}> {
  try {
    const session = await requireSession();
    enforceRateLimit(session.user.id, "cacheRefresh");

    revalidatePath('/dashboard');
    revalidateTag('dashboard-data', { expire: 0 });
    revalidateTag('group-types', { expire: 0 });
    return {
      success: true,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error refreshing dashboard cache:', error);
    return {
      success: false,
      timestamp: new Date()
    };
  }
}
