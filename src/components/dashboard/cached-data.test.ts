/**
 * Cached dashboard reads keep their last good value when Ministry Platform fails (#304).
 *
 * The 'use cache' directive is inert under Vitest (it is only a string
 * expression), and next/cache is mocked to no-ops. So this tests the contract
 * between the REAL serviceCache and DashboardService, the layer that used to
 * cache an empty result:
 *
 *   - while a good value is cached, a failed background refresh keeps it
 *     (before #304 the service swallowed the failure, resolved with empty data,
 *     and serviceCache stored that over the good value);
 *   - on a cold miss, a failure rejects and nothing is cached, so the next call
 *     re-queries MP.
 *
 * MPHelper is a stub whose getTableRecords routes by table; only Date is faked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetTableRecords } = vi.hoisted(() => ({ mockGetTableRecords: vi.fn() }));

vi.mock('@/lib/providers/ministry-platform', () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
  },
}));

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

import {
  getCachedDashboardData,
  getCachedEngagementData,
  getCachedExtendedData,
} from '@/components/dashboard/cached-data';
import { serviceCache, CACHE_TTL } from '@/lib/service-cache';

type QueryParams = { table: string; select?: string; filter?: string };
type Handler = (p: QueryParams) => unknown[] | Promise<unknown[]>;

const NOW = new Date('2025-11-17T12:00:00Z');
const RANGE = ['2025-09-01', '2026-08-31'] as const;

let failing: ((p: QueryParams) => boolean) | null = null;

/** IDs inside the first `IN (...)` of a filter. */
const idsIn = (filter: string | undefined): number[] =>
  (/IN \(([^)]*)\)/.exec(filter ?? '')?.[1] ?? '').split(',').filter(Boolean).map(Number);

/** A healthy MP: one small group with one member, one adult with activity. */
const HEALTHY: Record<string, Handler> = {
  Groups: (p) =>
    p.select === 'Group_ID,Group_Type_ID' ? [{ Group_ID: 1, Group_Type_ID: 1 }] : [],
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

function callsFor(table: string): QueryParams[] {
  return mockGetTableRecords.mock.calls.map((c) => c[0] as QueryParams).filter((p) => p.table === table);
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  serviceCache.deleteByPrefix('dashboard');
  serviceCache.deleteByPrefix('group-types');
  failing = null;
  mockGetTableRecords.mockReset();
  mockGetTableRecords.mockImplementation(async (p: QueryParams) => {
    if (failing?.(p)) throw new Error('MP down');
    const h = HEALTHY[p.table];
    return h ? h(p) : [];
  });
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  serviceCache.deleteByPrefix('dashboard');
  serviceCache.deleteByPrefix('group-types');
});

describe('stale value retention (#304)', () => {
  it('keeps the last good extended data when a background refresh hits an MP failure', async () => {
    const first = await getCachedExtendedData(...RANGE);
    expect(first.rosterMemberRecords).toHaveLength(1);

    // Past the 6h TTL, MP starts failing the roster's Groups read.
    vi.setSystemTime(new Date(NOW.getTime() + CACHE_TTL.STANDARD + 1000));
    failing = (p) => p.table === 'Groups';

    const second = await getCachedExtendedData(...RANGE); // stale hit, refresh in background
    expect(second.rosterMemberRecords).toHaveLength(1);

    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith('Error fetching roster and attendance raw data:', expect.stringContaining('MP down')),
    );
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the refresh settle

    // Before #304 the refresh resolved with an empty roster and was stored.
    const third = await getCachedExtendedData(...RANGE);
    expect(third.rosterMemberRecords).toHaveLength(1);
  });
});

describe('cold miss (#304)', () => {
  it.each<[string, () => Promise<unknown>, (p: QueryParams) => boolean, string]>([
    ['getCachedExtendedData', () => getCachedExtendedData(...RANGE), (p) => p.table === 'Groups', 'Groups'],
    [
      'getCachedEngagementData',
      () => getCachedEngagementData(...RANGE),
      (p) => p.table === 'Activity_Log' && (p.filter ?? '').includes("Activity_Date >= '2025-10-01 "),
      'Activity_Log',
    ],
    [
      'getCachedDashboardData',
      () => getCachedDashboardData(2025),
      (p) => p.table === 'Participant_Milestones',
      'Participant_Milestones',
    ],
  ])('%s rejects and caches nothing, so the next call re-queries MP', async (_name, call, fail, table) => {
    failing = fail;
    await expect(call()).rejects.toThrow();
    const before = callsFor(table).length;
    expect(before).toBeGreaterThan(0);

    failing = null;
    const data = await call();
    expect(data).toBeTruthy();
    expect(callsFor(table).length).toBeGreaterThan(before);
  });

  it('a healed engagement read returns the activity that the failed one would have hidden', async () => {
    failing = (p) => p.table === 'Activity_Log' && (p.filter ?? '').includes("Activity_Date >= '2025-10-01 ");
    await expect(getCachedEngagementData(...RANGE)).rejects.toThrow(/1\/3 monthly Activity_Log queries failed/);

    failing = null;
    const data = await getCachedEngagementData(...RANGE);
    expect(data.engagementRawData?.activityByMonth.map((b) => b.month)).toEqual(['2025-09', '2025-10', '2025-11']);
  });
});

// The Refresh button marks the entries (refreshDashboardCache) and the client
// re-reads them. An MP failure during that re-read must not cost the last good
// value: the re-read rejects (the shell keeps what it shows) and the next read
// is served the previous data instantly, not a cold fetch.
describe('explicit refresh (markForRefresh)', () => {
  it('re-queries MP and returns fresh data when MP is healthy', async () => {
    await getCachedExtendedData(...RANGE);
    const before = callsFor('Groups').length;

    serviceCache.markForRefresh('dashboard');
    const data = await getCachedExtendedData(...RANGE);
    expect(data.rosterMemberRecords).toHaveLength(1);
    expect(callsFor('Groups').length).toBeGreaterThan(before);
  });

  it('rejects the refresh on an MP failure, then serves the last good value without another MP call', async () => {
    const first = await getCachedExtendedData(...RANGE);
    expect(first.rosterMemberRecords).toHaveLength(1);

    serviceCache.markForRefresh('dashboard');
    failing = (p) => p.table === 'Groups';
    await expect(getCachedExtendedData(...RANGE)).rejects.toThrow('MP down');

    const callsAfterFailure = mockGetTableRecords.mock.calls.length;
    const next = await getCachedExtendedData(...RANGE);
    expect(next.rosterMemberRecords).toHaveLength(1);
    expect(mockGetTableRecords.mock.calls.length).toBe(callsAfterFailure);
  });
});
