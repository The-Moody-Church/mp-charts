/**
 * Refresh Data while Ministry Platform is failing: the page render that follows
 * the action must not be able to throw.
 *
 * Because refreshDashboardCache calls updateTag, Next re-renders /dashboard into
 * the action's own response, and that render reads getFullRangeDashboardMetrics.
 * When the action expired the tags first and left the MP fetch to that render,
 * an MP failure threw in DashboardContent and dashboard/error.tsx replaced the
 * whole page, whatever the shell did with the action's result. A later read of
 * the old cached value then made the failed refresh look like a success.
 *
 * Wired for real here: the actions, both cached-data layers' serviceCache side,
 * the real serviceCache and DashboardService. Stubbed: MPHelper (routes by table),
 * auth, the rate limiter and next/cache. The 'use cache' directive is inert under
 * Vitest, so every read here runs the function body: the worst case for the
 * render, which in production runs the body only for a tag that was expired.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetTableRecords, mockUpdateTag } = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
  mockUpdateTag: vi.fn(),
}));

vi.mock('@/lib/providers/ministry-platform', () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
  },
}));
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: mockUpdateTag,
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/authorization', () => ({
  requireFeatureAccess: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn() }));

import {
  getFullRangeDashboardMetrics,
  getExtendedDashboardMetrics,
  getEngagementDashboardMetrics,
  refreshDashboardCache,
} from '@/components/dashboard/actions';
import { serviceCache } from '@/lib/service-cache';

type QueryParams = { table: string; select?: string; filter?: string };

const T0 = new Date('2025-11-17T12:00:00Z');
const T1 = new Date('2025-11-17T13:00:00Z');
const T2 = new Date('2025-11-17T14:00:00Z');

let failing: ((p: QueryParams) => boolean) | null = null;

const idsIn = (filter: string | undefined): number[] =>
  (/IN \(([^)]*)\)/.exec(filter ?? '')?.[1] ?? '').split(',').filter(Boolean).map(Number);

/** A healthy MP: one small group with one member, one adult with activity, one baptism. */
const HEALTHY: Record<string, (p: QueryParams) => unknown[]> = {
  Groups: (p) => (p.select === 'Group_ID,Group_Type_ID' ? [{ Group_ID: 1, Group_Type_ID: 1 }] : []),
  Group_Types: () => [{ Group_Type_ID: 1, Group_Type: 'Small Group' }],
  Group_Participants: (p) =>
    p.select === 'Group_ID,Participant_ID,Start_Date,End_Date'
      ? [{ Group_ID: 1, Participant_ID: 10, Start_Date: '2025-09-01T00:00:00', End_Date: null }]
      : [],
  Participants: (p) => idsIn(p.filter).map((id) => ({ Participant_ID: id, Contact_ID: 1000 + id })),
  Activity_Log: () => [{ Contact_ID: 1001 }],
  Contacts: (p) => idsIn(p.filter).map((id) => ({ Contact_ID: id, Date_of_Birth: null })),
  Participant_Milestones: () => [{ Date_Accomplished: '2025-10-05T00:00:00' }],
};

const mpCalls = () => mockGetTableRecords.mock.calls.length;
const updatedTags = () => mockUpdateTag.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  serviceCache.deleteByPrefix('dashboard');
  serviceCache.deleteByPrefix('group-types');
  failing = null;
  mockGetTableRecords.mockReset();
  mockGetTableRecords.mockImplementation(async (p: QueryParams) => {
    if (failing?.(p)) throw new Error('MP down');
    return HEALTHY[p.table]?.(p) ?? [];
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  serviceCache.deleteByPrefix('dashboard');
  serviceCache.deleteByPrefix('group-types');
});

/** The page's first load: all three sections cached at T0. */
async function loadPage() {
  const core = await getFullRangeDashboardMetrics();
  await getExtendedDashboardMetrics();
  await getEngagementDashboardMetrics();
  expect(core.generatedAt).toBe(T0.toISOString());
  return core;
}

describe('Refresh Data with Ministry Platform failing', () => {
  it('reports the core failure, leaves its tag alone, and the following page render serves the last good data', async () => {
    const before = await loadPage();

    vi.setSystemTime(T1);
    failing = (p) => p.table === 'Participant_Milestones'; // a core-only read
    const result = await refreshDashboardCache();

    expect(result.refused).toBe(false);
    expect(result.success).toBe(false);
    expect(result.core).toBeUndefined();
    expect(result.extended?.rosterMemberRecords).toHaveLength(1);
    expect(result.engagement?.engagementRawData).toBeDefined();
    // group-types before the loads; the failed core section's tag never.
    expect(updatedTags()).toEqual(['group-types', 'dashboard-extended', 'dashboard-engagement']);

    // The render Next does into the action's response, and any read after it:
    // served the previous data, with no forced MP fetch left to fail.
    const callsBefore = mpCalls();
    await expect(getFullRangeDashboardMetrics()).resolves.toEqual(before);
    expect(mpCalls()).toBe(callsBefore);
  });

  it('cannot throw in the following render even when every section fails', async () => {
    await loadPage();

    vi.setSystemTime(T1);
    failing = () => true;
    const result = await refreshDashboardCache();

    expect(result).toEqual({ success: false, refused: false, timestamp: T1 });
    expect(updatedTags()).toEqual(['group-types']);

    const callsBefore = mpCalls();
    await expect(getFullRangeDashboardMetrics()).resolves.toMatchObject({ generatedAt: T0.toISOString() });
    await expect(getExtendedDashboardMetrics()).resolves.toBeDefined();
    await expect(getEngagementDashboardMetrics()).resolves.toBeDefined();
    expect(mpCalls()).toBe(callsBefore);
  });

  it('once MP heals, the next Refresh returns fresh core data and the render serves it without another MP call', async () => {
    await loadPage();
    vi.setSystemTime(T1);
    failing = () => true;
    await refreshDashboardCache();

    vi.setSystemTime(T2);
    failing = null;
    mockUpdateTag.mockClear();
    const result = await refreshDashboardCache();

    expect(result.success).toBe(true);
    expect(result.core?.generatedAt).toBe(T2.toISOString());
    expect(updatedTags()).toEqual(['group-types', 'dashboard-full-range', 'dashboard-extended', 'dashboard-engagement']);

    const callsBefore = mpCalls();
    await expect(getFullRangeDashboardMetrics()).resolves.toMatchObject({ generatedAt: T2.toISOString() });
    expect(mpCalls()).toBe(callsBefore);
  });
});
