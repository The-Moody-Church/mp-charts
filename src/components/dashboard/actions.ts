'use server';

import { updateTag } from 'next/cache';
import { requireFeatureAccess } from '@/lib/authorization';
import { enforceRateLimit } from '@/lib/rate-limit';
import { serviceCache } from '@/lib/service-cache';
import { DashboardData, DashboardRefreshResult } from '@/lib/dto';
import {
  getCachedFullRangeData,
  getCachedExtendedData,
  getCachedEngagementData,
  loadFullRangeData,
  loadExtendedData,
  loadEngagementData,
} from './cached-data';
import { getDashboardRange } from './dashboard-range';

/**
 * Fetches dashboard data for the full selectable date range (5 ministry years).
 * All data is loaded once and filtered client-side when the user changes the filter.
 * Cached for 6 hours with manual invalidation support.
 *
 * @returns Promise<DashboardData> - Complete dashboard metrics for the full range
 */
export async function getFullRangeDashboardMetrics(): Promise<DashboardData> {
  await requireFeatureAccess("dashboard");
  // End-of-ministry-year (Aug 31) is a stable cache key — it changes only once per
  // ministry year instead of daily (dashboard-range.ts).
  const { earliestYear, endDateIso } = getDashboardRange();
  return getCachedFullRangeData(earliestYear, endDateIso);
}

/**
 * Fetches extended dashboard data (engagement overlap, serving, roster metrics).
 * Called separately from core data so the page can render progressively.
 * Cached for 6 hours with manual invalidation support.
 */
export async function getExtendedDashboardMetrics(): Promise<Partial<DashboardData>> {
  await requireFeatureAccess("dashboard");
  const { fullRangeStartIso, fullRangeEndIso } = getDashboardRange();
  return getCachedExtendedData(fullRangeStartIso, fullRangeEndIso);
}

/**
 * Fetches engagement venn diagram data (Activity_Log — slowest query).
 * Loaded separately from extended data so other charts can render first.
 * Cached for 6 hours with manual invalidation support.
 */
export async function getEngagementDashboardMetrics(): Promise<Partial<DashboardData>> {
  await requireFeatureAccess("dashboard");
  const { fullRangeStartIso, fullRangeEndIso } = getDashboardRange();
  return getCachedEngagementData(fullRangeStartIso, fullRangeEndIso);
}

/** The 'use cache' tag of each section, expired only once that section reloaded. */
const SECTION_TAGS = {
  core: 'dashboard-full-range',
  extended: 'dashboard-extended',
  engagement: 'dashboard-engagement',
} as const;

/**
 * Manually refreshes the dashboard: reloads core, extended and engagement data
 * from Ministry Platform and returns whichever sections reloaded.
 *
 * Order matters (.claude/rules/caching.md, "Refresh"):
 * 1. Mark the serviceCache entries, so the loads below fetch from MP in the
 *    foreground while keeping the last good value if MP fails.
 * 2. Expire `group-types` first: the core and extended loads look Group_Types up
 *    through getCachedGroupTypes ('use cache'), whose body, and with it the marked
 *    serviceCache entry, only runs once its tag has expired in this request.
 * 3. Load the three sections HERE, through the serviceCache layer.
 * 4. Only then expire the 'use cache' tag of each section that reloaded.
 *
 * Why 3 before 4: updateTag marks the action as having revalidated, so Next
 * re-renders /dashboard into this action's response. If the tags were expired
 * before the loads, that render would run the forced MP fetch itself, and an MP
 * failure would throw in DashboardContent and reach dashboard/error.tsx, replacing
 * the whole page however carefully the shell handled the result. Done in this
 * order, every forced fetch has settled before the render: a section that
 * reloaded has its fresh value in serviceCache, and a section that failed still
 * has its 'use cache' entry (its tag is never expired) and its last good
 * serviceCache value, no longer marked. Neither can throw.
 */
export async function refreshDashboardCache(): Promise<DashboardRefreshResult> {
  const refused = (error: unknown): DashboardRefreshResult => {
    console.error('Error refreshing dashboard cache:', error);
    return { success: false, refused: true, timestamp: new Date() };
  };

  try {
    const session = await requireFeatureAccess("dashboard");
    enforceRateLimit(session.user.id, "cacheRefresh");

    // markForRefresh, not deleteByPrefix: the last good value is kept until the
    // forced fetch succeeds, so an MP failure during Refresh costs nothing.
    serviceCache.markForRefresh('dashboard');
    serviceCache.markForRefresh('group-types');
    updateTag('group-types');
  } catch (error) {
    return refused(error);
  }

  // NOTE: Do NOT use revalidatePath here — it hard-purges the page's PPR shell,
  // forcing a full re-render (10+ seconds).
  const { earliestYear, endDateIso, fullRangeStartIso, fullRangeEndIso } = getDashboardRange();
  const [core, extended, engagement] = await Promise.allSettled([
    loadFullRangeData(earliestYear, endDateIso),
    loadExtendedData(fullRangeStartIso, fullRangeEndIso),
    loadEngagementData(fullRangeStartIso, fullRangeEndIso),
  ]);

  const result: DashboardRefreshResult = { success: true, refused: false, timestamp: new Date() };
  const sections = { core, extended, engagement };
  for (const name of Object.keys(sections) as (keyof typeof sections)[]) {
    const settled = sections[name];
    if (settled.status === 'rejected') {
      // serviceCache already logged the failure with its key.
      result.success = false;
      continue;
    }
    try {
      updateTag(SECTION_TAGS[name]);
    } catch (error) {
      // The section reloaded into serviceCache but its 'use cache' entry could not
      // be expired, so a reload of the page would still show the old value.
      console.error('Error refreshing dashboard cache:', error);
      result.success = false;
    }
    // Hand the fresh data back either way: it is what MP returned just now.
    if (name === 'core') result.core = settled.value as DashboardData;
    else result[name] = settled.value;
  }
  return result;
}
