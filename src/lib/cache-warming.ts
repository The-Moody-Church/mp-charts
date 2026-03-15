/**
 * Cache Warming Module
 *
 * Centralizes all cache warming logic. Called automatically on server start
 * via instrumentation.ts → /api/cache-warm (HTTP request needed for 'use cache' context).
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  IMPORTANT: When adding a new 'use cache' function anywhere in     ║
 * ║  the codebase, you MUST register it here so it warms on startup.   ║
 * ║  See the "Cache Warming" section in CLAUDE.md for details.         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Current cached functions that are warmed:
 *
 * | Function                    | Source File                                      | Revalidate | Stale |
 * |-----------------------------|--------------------------------------------------|------------|-------|
 * | getCachedDashboardData      | src/components/dashboard/cached-data.ts           | 6h         | 24h   |
 * | getCachedFullRangeData      | src/components/dashboard/cached-data.ts           | 6h         | 24h   |
 * | getCachedExtendedData       | src/components/dashboard/cached-data.ts           | 6h         | 24h   |
 * | getCachedEngagementData     | src/components/dashboard/cached-data.ts           | 6h         | 24h   |
 * | getCachedGroupTypes         | src/services/dashboardService.ts                 | 24h        | 48h   |
 * | getCachedAllContacts        | src/components/contact-lookup/cached-contacts.ts  | 6h         | 24h   |
 *
 * Note: getCachedGroupTypes is warmed indirectly — it's called internally
 * by DashboardService during getCachedDashboardData/getCachedFullRangeData.
 */

import {
  getCachedDashboardData,
  getCachedFullRangeData,
  getCachedExtendedData,
  getCachedEngagementData,
} from '@/components/dashboard/cached-data';
import { getCachedAllContacts } from '@/components/contact-lookup/cached-contacts';

interface WarmingResult {
  name: string;
  status: 'success' | 'error';
  durationMs: number;
  error?: string;
}

/**
 * Computes the current ministry year.
 * Duplicated from dashboard actions to avoid importing from 'use server' module.
 */
function getCurrentMinistryYear(): number {
  const today = new Date();
  return today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
}

/**
 * Computes common date parameters used by dashboard cached functions.
 * Mirrors the parameter computation in dashboard server actions.
 */
function getDashboardDateParams() {
  const currentYear = getCurrentMinistryYear();
  const earliestYear = currentYear - 4;
  const today = new Date();
  const maxEnd = new Date(currentYear + 1, 7, 31);
  const endDate = today < maxEnd ? today : maxEnd;

  const endDateIso = endDate.toISOString().split('T')[0];
  const fullRangeStartIso = new Date(earliestYear, 8, 1).toISOString().split('T')[0];
  const fullRangeEndIso = endDateIso;

  return { currentYear, earliestYear, endDateIso, fullRangeStartIso, fullRangeEndIso };
}

/**
 * Warms a single cache entry and returns the result.
 */
async function warmOne(name: string, fn: () => Promise<unknown>): Promise<WarmingResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: 'success', durationMs: Date.now() - start };
  } catch (error) {
    return {
      name,
      status: 'error',
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Warms all registered caches. Returns detailed results for each.
 *
 * Dashboard caches run in parallel (Stage 1: core + full range, Stage 2: extended + engagement).
 * Contact search cache runs in parallel with dashboard caches.
 */
export async function warmAllCaches(): Promise<WarmingResult[]> {
  const params = getDashboardDateParams();

  // Run all cache warming in parallel — each is independent
  const results = await Promise.all([
    // Dashboard: current ministry year
    warmOne('getCachedDashboardData', () =>
      getCachedDashboardData(params.currentYear)
    ),
    // Dashboard: full 5-year range
    warmOne('getCachedFullRangeData', () =>
      getCachedFullRangeData(params.earliestYear, params.endDateIso)
    ),
    // Dashboard: extended data (serving, roster, event participants)
    warmOne('getCachedExtendedData', () =>
      getCachedExtendedData(params.fullRangeStartIso, params.fullRangeEndIso)
    ),
    // Dashboard: engagement venn (Activity_Log — slowest query)
    warmOne('getCachedEngagementData', () =>
      getCachedEngagementData(params.fullRangeStartIso, params.fullRangeEndIso)
    ),
    // Contact search: all contacts dataset
    warmOne('getCachedAllContacts', () =>
      getCachedAllContacts()
    ),
  ]);

  return results;
}
