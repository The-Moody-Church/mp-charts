'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { requireFeatureAccess } from '@/lib/authorization';
import { enforceRateLimit } from '@/lib/rate-limit';
import { DashboardData } from '@/lib/dto';
import {
  getCachedDashboardData,
  getCachedFullRangeData,
  getCachedExtendedData,
  getCachedEngagementData,
} from './cached-data';

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
  await requireFeatureAccess("dashboard");
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
  await requireFeatureAccess("dashboard");
  const currentYear = getCurrentMinistryYear();
  const earliestYear = currentYear - 4;

  // Use end-of-ministry-year (Aug 31) as a stable cache key — changes only once
  // per ministry year instead of daily. The service methods cap month iteration
  // at today internally, so no wasted API calls for future months.
  const endDateIso = `${currentYear + 1}-08-31`;

  return getCachedFullRangeData(earliestYear, endDateIso);
}

/**
 * Fetches extended dashboard data (engagement overlap, serving, roster metrics).
 * Called separately from core data so the page can render progressively.
 * Cached for 6 hours with manual invalidation support.
 */
export async function getExtendedDashboardMetrics(): Promise<Partial<DashboardData>> {
  await requireFeatureAccess("dashboard");
  const currentYear = getCurrentMinistryYear();
  const earliestYear = currentYear - 4;

  // Use stable full-range dates (changes only at ministry year rollover in September)
  const fullRangeStartIso = `${earliestYear}-09-01`;
  const fullRangeEndIso = `${currentYear + 1}-08-31`;

  return getCachedExtendedData(fullRangeStartIso, fullRangeEndIso);
}

/**
 * Fetches engagement venn diagram data (Activity_Log — slowest query).
 * Loaded separately from extended data so other charts can render first.
 * Cached for 6 hours with manual invalidation support.
 */
export async function getEngagementDashboardMetrics(): Promise<Partial<DashboardData>> {
  await requireFeatureAccess("dashboard");
  const currentYear = getCurrentMinistryYear();
  const earliestYear = currentYear - 4;

  // Use stable full-range dates (changes only at ministry year rollover in September)
  const fullRangeStartIso = `${earliestYear}-09-01`;
  const fullRangeEndIso = `${currentYear + 1}-08-31`;

  return getCachedEngagementData(fullRangeStartIso, fullRangeEndIso);
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
    const session = await requireFeatureAccess("dashboard");
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
