/**
 * DashboardService — core paths (#302).
 *
 * Covers lines ~1-530 of dashboardService.ts: the module-private
 * mapWithConcurrency (through getMonthlyAttendanceTrends, its only caller),
 * getCachedGroupTypes / getGroupTypesWithCache, getInstance, getDashboardData,
 * getGroupTypeMetrics and getPeriodMetrics. The trend/extended/engagement
 * methods further down the file are covered elsewhere.
 *
 * Nothing here reaches Ministry Platform: MPHelper is a stub class whose
 * getTableRecords delegates to one vi.fn, and `serviceCache.getOrFetch` just
 * runs the fetcher (so one test's cached Group_Types can never leak into the next).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockGetTableRecords,
  mpConstructed,
  mpCallOwner,
  mockGetOrFetch,
  mockCacheLife,
  mockCacheTag,
} = vi.hoisted(() => ({
  mockGetTableRecords: vi.fn(),
  /** Records the options each MPHelper was constructed with. */
  mpConstructed: vi.fn(),
  /** Records, per getTableRecords call, the options of the MPHelper that made it. */
  mpCallOwner: vi.fn(),
  mockGetOrFetch: vi.fn(),
  mockCacheLife: vi.fn(),
  mockCacheTag: vi.fn(),
}));

vi.mock('@/lib/providers/ministry-platform', () => ({
  MPHelper: class {
    private readonly opts: unknown;
    constructor(opts?: unknown) {
      this.opts = opts;
      mpConstructed(opts);
    }
    getTableRecords(params: unknown) {
      mpCallOwner((params as { table: string }).table, this.opts);
      return mockGetTableRecords(params);
    }
  },
}));

vi.mock('next/cache', () => ({
  cacheLife: mockCacheLife,
  cacheTag: mockCacheTag,
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('@/lib/service-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/service-cache')>();
  return {
    ...actual,
    serviceCache: { getOrFetch: mockGetOrFetch },
  };
});

import { DashboardService } from '@/services/dashboardService';
import { CACHE_TTL } from '@/lib/service-cache';
import type { GroupTypeMetrics, PeriodMetrics, MonthlyAttendanceTrend } from '@/lib/dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QueryParams = { table: string; select?: string; filter?: string };

/** The private methods under test, reached through a typed cast. */
interface DashboardServicePrivates {
  getGroupTypeMetrics(start: Date, end: Date): Promise<GroupTypeMetrics[]>;
  getPeriodMetrics(start: Date, end: Date): Promise<PeriodMetrics>;
  getMonthlyAttendanceTrends(start: Date, end: Date): Promise<MonthlyAttendanceTrend[]>;
  getGroupTypesWithCache(ids: Set<number>): Promise<{ Group_Type_ID: number; Group_Type: string }[]>;
}

async function getPrivates(accessToken?: string): Promise<DashboardServicePrivates> {
  return (await DashboardService.getInstance(accessToken)) as unknown as DashboardServicePrivates;
}

function calls(): QueryParams[] {
  return mockGetTableRecords.mock.calls.map((c) => c[0] as QueryParams);
}

function callsFor(table: string, select?: string): QueryParams[] {
  return calls().filter((p) => p.table === table && (select === undefined || p.select === select));
}

/** Extracts the comma-separated list inside `<column> IN (...)`. */
function inList(filter: string | undefined, column: string): number[] {
  const escaped = column.replace(/[.[\]]/g, '\\$&');
  const match = new RegExp(`${escaped} IN \\(([^)]*)\\)`).exec(filter ?? '');
  if (!match) throw new Error(`no "${column} IN (...)" in filter: ${filter}`);
  return match[1].split(',').map(Number);
}

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Fixed "now" so getMonthlyAttendanceTrends' cap-at-today is deterministic.
// Only Date is faked: real setTimeout keeps the concurrency tests honest.
const NOW = new Date('2026-11-17T12:00:00Z');

// Ministry year Sept 2025 – Aug 2026, built in local time the way callers do.
const YEAR_START = new Date(2025, 8, 1);
const YEAR_END = new Date(2026, 7, 31, 23, 59, 59);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mockGetOrFetch.mockImplementation((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher());
  mockGetTableRecords.mockResolvedValue([]);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// getInstance
// ---------------------------------------------------------------------------

describe('DashboardService.getInstance', () => {
  it('returns the same client-credentials singleton on every call without a token', async () => {
    vi.resetModules();
    const { DashboardService: Fresh } = await import('@/services/dashboardService');

    const a = await Fresh.getInstance();
    const b = await Fresh.getInstance();

    expect(a).toBe(b);
    // One MPHelper for the singleton, built with no options (client credentials).
    expect(mpConstructed).toHaveBeenCalledTimes(1);
    expect(mpConstructed).toHaveBeenCalledWith(undefined);
  });

  it('builds a fresh per-request instance, bound to the user token, when a token is given', async () => {
    const singleton = await DashboardService.getInstance();
    mpConstructed.mockClear();

    const a = await DashboardService.getInstance('token-a');
    const b = await DashboardService.getInstance('token-b');

    expect(a).not.toBe(b);
    expect(a).not.toBe(singleton);
    expect(mpConstructed.mock.calls).toEqual([[{ accessToken: 'token-a' }], [{ accessToken: 'token-b' }]]);
    // The token instance does not replace the singleton.
    await expect(DashboardService.getInstance()).resolves.toBe(singleton);
  });

  it('treats an empty-string token as "no token" and returns the singleton', async () => {
    const singleton = await DashboardService.getInstance();
    await expect(DashboardService.getInstance('')).resolves.toBe(singleton);
  });

  it('runs main queries as the user but the cached Group_Types lookup on client credentials', async () => {
    mockGetTableRecords.mockImplementation((p: QueryParams) => {
      if (p.table === 'Groups') return Promise.resolve([{ Group_ID: 1, Group_Type_ID: 1, Ministry_ID: null }]);
      if (p.table === 'Group_Types') return Promise.resolve([{ Group_Type_ID: 1, Group_Type: 'Small Group' }]);
      return Promise.resolve([]);
    });
    const service = await getPrivates('user-token');

    await service.getGroupTypeMetrics(YEAR_START, YEAR_END);

    const owners = new Map(mpCallOwner.mock.calls.map(([table, opts]) => [table, opts]));
    expect(owners.get('Groups')).toEqual({ accessToken: 'user-token' });
    expect(owners.get('Group_Participants')).toEqual({ accessToken: 'user-token' });
    // Documented: 'use cache' lookups run outside the user's request context.
    expect(owners.get('Group_Types')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getCachedGroupTypes / getGroupTypesWithCache
// ---------------------------------------------------------------------------

describe('getGroupTypesWithCache / getCachedGroupTypes', () => {
  it('queries Group_Types with sanitized IDs and declares its 24h/48h cache profile and tag', async () => {
    const rows = [{ Group_Type_ID: 1, Group_Type: 'Small Group' }];
    mockGetTableRecords.mockResolvedValue(rows);
    const service = await getPrivates();

    await expect(service.getGroupTypesWithCache(new Set([3, 1]))).resolves.toEqual(rows);

    expect(mockCacheLife).toHaveBeenCalledWith({ revalidate: 86400, stale: 172800 });
    expect(mockCacheTag).toHaveBeenCalledWith('group-types');
    expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: 'Group_Types',
      select: 'Group_Type_ID,Group_Type',
      filter: 'Group_Type_ID IN (1,3)',
    });
  });

  it('wraps the fetch in serviceCache.getOrFetch with a group-types key and the LONG TTL', async () => {
    const service = await getPrivates();
    await service.getGroupTypesWithCache(new Set([11, 3, 1]));

    expect(mockGetOrFetch).toHaveBeenCalledTimes(1);
    const [key, ttl] = mockGetOrFetch.mock.calls[0];
    // Array#sort() with no comparator is lexicographic: "1,11,3", not "1,3,11".
    // Harmless — the key only has to be stable, and the IN list is order-free.
    expect(key).toBe('group-types:1,11,3');
    expect(ttl).toBe(CACHE_TTL.LONG);
  });

  it('produces the same cache key whatever order the IDs were collected in', async () => {
    const service = await getPrivates();
    await service.getGroupTypesWithCache(new Set([11, 3, 1]));
    await service.getGroupTypesWithCache(new Set([1, 3, 11]));
    await service.getGroupTypesWithCache(new Set([3, 11, 1]));

    const keys = mockGetOrFetch.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(1);
  });

  it('serves the service-cache value without touching MP when the cache already holds it', async () => {
    const cached = [{ Group_Type_ID: 1, Group_Type: 'From cache' }];
    mockGetOrFetch.mockResolvedValueOnce(cached);
    const service = await getPrivates();

    await expect(service.getGroupTypesWithCache(new Set([1]))).resolves.toBe(cached);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it('drops non-positive IDs through sanitizeIds before they reach the filter', async () => {
    const service = await getPrivates();
    await service.getGroupTypesWithCache(new Set([0, 5, -2]));
    expect(callsFor('Group_Types')[0].filter).toBe('Group_Type_ID IN (5)');
  });

  it('rejects (and makes no MP call) when no ID survives sanitizing', async () => {
    const service = await getPrivates();
    await expect(service.getGroupTypesWithCache(new Set([0]))).rejects.toThrow(/no valid IDs/);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it('propagates an MP failure instead of caching an empty list', async () => {
    mockGetTableRecords.mockRejectedValue(new Error('MP down'));
    const service = await getPrivates();
    await expect(service.getGroupTypesWithCache(new Set([1]))).rejects.toThrow('MP down');
  });
});

// ---------------------------------------------------------------------------
// getPeriodMetrics
// ---------------------------------------------------------------------------

describe('getPeriodMetrics', () => {
  const start = new Date('2025-09-01T05:00:00.000Z');
  const end = new Date('2026-09-01T04:59:59.000Z');

  function withEventsAndMetrics(
    events: { Event_ID: number }[],
    metrics: { Event_ID: number; Metric_ID: number; Numerical_Value: number }[],
  ) {
    mockGetTableRecords.mockImplementation((p: QueryParams) => {
      if (p.table === 'Events') return Promise.resolve(events);
      if (p.table === 'Event_Metrics') {
        const ids = new Set(inList(p.filter, 'Event_Metrics.Event_ID'));
        return Promise.resolve(metrics.filter((m) => ids.has(m.Event_ID)));
      }
      return Promise.resolve([]);
    });
  }

  it('queries non-cancelled worship-service events (type 7) inside the period', async () => {
    const service = await getPrivates();
    await service.getPeriodMetrics(start, end);

    const [eventsCall] = callsFor('Events');
    expect(eventsCall.select).toBe('Event_ID');
    const filter = eventsCall.filter!.replace(/\s+/g, ' ').trim();
    expect(filter).toBe(
      "Events.Event_Start_Date >= '2025-09-01T05:00:00.000Z' AND " +
        "Events.Event_End_Date <= '2026-09-01T04:59:59.000Z' AND " +
        'Events.Cancelled = 0 AND Events.Event_Type_ID = 7',
    );
  });

  it('returns zeros and makes no Event_Metrics call when there are no events', async () => {
    const service = await getPrivates();
    await expect(service.getPeriodMetrics(start, end)).resolves.toEqual({
      periodStart: '2025-09-01T05:00:00.000Z',
      periodEnd: '2026-09-01T04:59:59.000Z',
      averageAttendance: 0,
      averageInPersonAttendance: 0,
      averageOnlineAttendance: 0,
      totalEvents: 0,
    });
    expect(callsFor('Event_Metrics')).toHaveLength(0);
  });

  it('reads only in-person (2) and online (3) metrics for the found events', async () => {
    withEventsAndMetrics([{ Event_ID: 10 }, { Event_ID: 20 }], []);
    const service = await getPrivates();
    await service.getPeriodMetrics(start, end);

    const [metricsCall] = callsFor('Event_Metrics');
    expect(metricsCall.select).toBe('Event_Metric_ID,Event_ID,Metric_ID,Numerical_Value');
    expect(metricsCall.filter).toBe('Event_Metrics.Event_ID IN (10,20) AND Event_Metrics.Metric_ID IN (2, 3)');
  });

  it('averages each metric type over only the events that recorded it', async () => {
    withEventsAndMetrics(
      [{ Event_ID: 1 }, { Event_ID: 2 }, { Event_ID: 3 }],
      [
        { Event_ID: 1, Metric_ID: 2, Numerical_Value: 100 },
        { Event_ID: 1, Metric_ID: 3, Numerical_Value: 50 },
        { Event_ID: 2, Metric_ID: 2, Numerical_Value: 200 },
        // Event 3 recorded nothing: it must not dilute any average.
      ],
    );
    const service = await getPrivates();

    await expect(service.getPeriodMetrics(start, end)).resolves.toEqual({
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      totalEvents: 2,
      averageAttendance: 175, // (100 + 50 + 200) / 2 events with any metric
      averageInPersonAttendance: 150, // (100 + 200) / 2
      averageOnlineAttendance: 50, // 50 / 1 — not diluted by event 2's missing online figure
    });
  });

  it('rounds averages to whole people', async () => {
    withEventsAndMetrics(
      [{ Event_ID: 1 }, { Event_ID: 2 }, { Event_ID: 3 }],
      [
        { Event_ID: 1, Metric_ID: 2, Numerical_Value: 10 },
        { Event_ID: 2, Metric_ID: 2, Numerical_Value: 10 },
        { Event_ID: 3, Metric_ID: 2, Numerical_Value: 11 },
      ],
    );
    const service = await getPrivates();
    const result = await service.getPeriodMetrics(start, end);
    expect(result.averageInPersonAttendance).toBe(10); // 31 / 3 = 10.33
    expect(result.averageAttendance).toBe(10);
    expect(result.averageOnlineAttendance).toBe(0);
  });

  it('ignores metric types other than 2 and 3 in the sums but still counts the event', async () => {
    withEventsAndMetrics(
      [{ Event_ID: 1 }],
      [
        { Event_ID: 1, Metric_ID: 2, Numerical_Value: 80 },
        { Event_ID: 1, Metric_ID: 9, Numerical_Value: 1000 },
      ],
    );
    const service = await getPrivates();
    const result = await service.getPeriodMetrics(start, end);
    expect(result.averageAttendance).toBe(80);
    expect(result.totalEvents).toBe(1);
  });

  it('de-duplicates repeated Event_IDs before querying metrics', async () => {
    withEventsAndMetrics([{ Event_ID: 7 }, { Event_ID: 7 }, { Event_ID: 8 }], []);
    const service = await getPrivates();
    await service.getPeriodMetrics(start, end);
    expect(inList(callsFor('Event_Metrics')[0].filter, 'Event_Metrics.Event_ID')).toEqual([7, 8]);
  });

  it('batches Event_Metrics reads 100 IDs at a time (IIS URL limit) and sums across batches', async () => {
    const events = Array.from({ length: 250 }, (_, i) => ({ Event_ID: i + 1 }));
    const metrics = events.map((e) => ({ Event_ID: e.Event_ID, Metric_ID: 2, Numerical_Value: e.Event_ID }));
    withEventsAndMetrics(events, metrics);
    const service = await getPrivates();

    const result = await service.getPeriodMetrics(start, end);

    const batches = callsFor('Event_Metrics').map((c) => inList(c.filter, 'Event_Metrics.Event_ID'));
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(events.map((e) => e.Event_ID));
    for (const c of callsFor('Event_Metrics')) {
      expect(c.filter).toMatch(/ AND Event_Metrics\.Metric_ID IN \(2, 3\)$/);
    }
    expect(result.totalEvents).toBe(250);
    expect(result.averageInPersonAttendance).toBe(Math.round((250 * 251) / 2 / 250)); // 125.5 → 126
  });

  it('drops non-positive Event_IDs via sanitizeIds rather than interpolating them', async () => {
    withEventsAndMetrics([{ Event_ID: 0 }, { Event_ID: 5 }], []);
    const service = await getPrivates();
    await service.getPeriodMetrics(start, end);
    expect(callsFor('Event_Metrics')[0].filter).toBe(
      'Event_Metrics.Event_ID IN (5) AND Event_Metrics.Metric_ID IN (2, 3)',
    );
  });

  it.each([
    ['the Events query', 'Events'],
    ['an Event_Metrics batch', 'Event_Metrics'],
  ])('logs and returns the zero shape when %s fails', async (_label, failingTable) => {
    mockGetTableRecords.mockImplementation((p: QueryParams) => {
      if (p.table === failingTable) return Promise.reject(new Error('timeout'));
      if (p.table === 'Events') return Promise.resolve([{ Event_ID: 1 }]);
      return Promise.resolve([]);
    });
    const service = await getPrivates();

    await expect(service.getPeriodMetrics(start, end)).resolves.toEqual({
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      averageAttendance: 0,
      averageInPersonAttendance: 0,
      averageOnlineAttendance: 0,
      totalEvents: 0,
    });
    expect(console.error).toHaveBeenCalledWith('Error fetching period metrics:', expect.any(Error));
  });
});

// ---------------------------------------------------------------------------
// getGroupTypeMetrics
// ---------------------------------------------------------------------------

describe('getGroupTypeMetrics', () => {
  const start = new Date('2025-09-01T05:00:00.000Z');
  const end = new Date('2026-09-01T04:59:59.000Z');

  type Group = { Group_ID: number; Group_Type_ID: number; Ministry_ID: number | null };
  type GP = { Group_Participant_ID: number; Group_ID: number; Participant_ID: number };

  function withData(groups: Group[], types: { Group_Type_ID: number; Group_Type: string }[], participants: GP[]) {
    mockGetTableRecords.mockImplementation((p: QueryParams) => {
      if (p.table === 'Groups') return Promise.resolve(groups);
      if (p.table === 'Group_Types') return Promise.resolve(types);
      if (p.table === 'Group_Participants') {
        const ids = new Set(inList(p.filter, 'Group_Participants.Group_ID'));
        return Promise.resolve(participants.filter((gp) => ids.has(gp.Group_ID)));
      }
      return Promise.resolve([]);
    });
  }

  it('queries groups active at any point in the period', async () => {
    const service = await getPrivates();
    await service.getGroupTypeMetrics(start, end);

    const [groupsCall] = callsFor('Groups');
    expect(groupsCall.select).toBe('Group_ID,Group_Type_ID,Ministry_ID');
    expect(groupsCall.filter!.replace(/\s+/g, ' ').trim()).toBe(
      "Groups.Start_Date <= '2026-09-01T04:59:59.000Z' AND " +
        "(Groups.End_Date IS NULL OR Groups.End_Date >= '2025-09-01T05:00:00.000Z')",
    );
  });

  it('returns [] without further queries when no groups are active', async () => {
    const service = await getPrivates();
    await expect(service.getGroupTypeMetrics(start, end)).resolves.toEqual([]);
    expect(calls().map((c) => c.table)).toEqual(['Groups']);
  });

  it('aggregates participants per group type', async () => {
    withData(
      [
        { Group_ID: 1, Group_Type_ID: 1, Ministry_ID: 50 },
        { Group_ID: 2, Group_Type_ID: 1, Ministry_ID: 50 },
        { Group_ID: 3, Group_Type_ID: 11, Ministry_ID: null },
      ],
      [
        { Group_Type_ID: 1, Group_Type: 'Small Group' },
        { Group_Type_ID: 11, Group_Type: 'Community' },
      ],
      [
        { Group_Participant_ID: 101, Group_ID: 1, Participant_ID: 900 },
        { Group_Participant_ID: 102, Group_ID: 1, Participant_ID: 901 },
        { Group_Participant_ID: 103, Group_ID: 2, Participant_ID: 900 }, // same person, 2nd group
        { Group_Participant_ID: 104, Group_ID: 2, Participant_ID: 902 },
        { Group_Participant_ID: 105, Group_ID: 2, Participant_ID: 903 },
        { Group_Participant_ID: 106, Group_ID: 3, Participant_ID: 904 },
      ],
    );
    const service = await getPrivates();

    const result = await service.getGroupTypeMetrics(start, end);

    expect(result).toEqual([
      {
        groupTypeId: 1,
        groupTypeName: 'Small Group',
        ministryId: 50,
        activeGroupCount: 2,
        totalParticipants: 5, // rows
        uniqueParticipants: 4, // people
        averageGroupSize: 2, // round(4 / 2)
      },
      {
        groupTypeId: 11,
        groupTypeName: 'Community',
        ministryId: null,
        activeGroupCount: 1,
        totalParticipants: 1,
        uniqueParticipants: 1,
        averageGroupSize: 1,
      },
    ]);
  });

  it('reads participants for non-childcare groups only, with the period overlap filter', async () => {
    withData(
      [
        { Group_ID: 1, Group_Type_ID: 1, Ministry_ID: null },
        { Group_ID: 2, Group_Type_ID: 13, Ministry_ID: null }, // childcare
        { Group_ID: 3, Group_Type_ID: 3, Ministry_ID: null },
      ],
      [],
      [],
    );
    const service = await getPrivates();
    await service.getGroupTypeMetrics(start, end);

    const [gpCall] = callsFor('Group_Participants');
    expect(gpCall.select).toBe('Group_Participant_ID,Group_ID,Participant_ID');
    expect(gpCall.filter).toBe(
      'Group_Participants.Group_ID IN (1,3) AND ' +
        "Group_Participants.Start_Date <= '2026-09-01T04:59:59.000Z' AND " +
        "(Group_Participants.End_Date IS NULL OR Group_Participants.End_Date >= '2025-09-01T05:00:00.000Z')",
    );
    // The type lookup still includes 13 (it is filtered out of the result afterwards).
    expect(inList(callsFor('Group_Types')[0].filter, 'Group_Type_ID').sort((a, b) => a - b)).toEqual([1, 3, 13]);
  });

  it('returns [] when every active group is childcare (Group_Type_ID 13)', async () => {
    withData(
      [{ Group_ID: 1, Group_Type_ID: 13, Ministry_ID: null }],
      [{ Group_Type_ID: 13, Group_Type: 'Childcare' }],
      [{ Group_Participant_ID: 1, Group_ID: 1, Participant_ID: 1 }],
    );
    const service = await getPrivates();
    await expect(service.getGroupTypeMetrics(start, end)).resolves.toEqual([]);
    expect(callsFor('Group_Participants')).toHaveLength(0);
  });

  it('never reports childcare even if a childcare participant row comes back', async () => {
    mockGetTableRecords.mockImplementation((p: QueryParams) => {
      if (p.table === 'Groups') {
        return Promise.resolve([
          { Group_ID: 1, Group_Type_ID: 1, Ministry_ID: null },
          { Group_ID: 2, Group_Type_ID: 13, Ministry_ID: null },
        ]);
      }
      if (p.table === 'Group_Types') {
        return Promise.resolve([
          { Group_Type_ID: 1, Group_Type: 'Small Group' },
          { Group_Type_ID: 13, Group_Type: 'Childcare' },
        ]);
      }
      // A row for a group we did not ask about (group 2) must be skipped.
      return Promise.resolve([
        { Group_Participant_ID: 1, Group_ID: 1, Participant_ID: 1 },
        { Group_Participant_ID: 2, Group_ID: 2, Participant_ID: 2 },
      ]);
    });
    const service = await getPrivates();
    const result = await service.getGroupTypeMetrics(start, end);
    expect(result.map((r) => r.groupTypeId)).toEqual([1]);
    expect(result[0].totalParticipants).toBe(1);
  });

  it("labels a type MP's Group_Types lookup did not return as 'Unknown'", async () => {
    withData(
      [{ Group_ID: 1, Group_Type_ID: 42, Ministry_ID: null }],
      [],
      [{ Group_Participant_ID: 1, Group_ID: 1, Participant_ID: 1 }],
    );
    const service = await getPrivates();
    const [metric] = await service.getGroupTypeMetrics(start, end);
    expect(metric.groupTypeName).toBe('Unknown');
  });

  it('omits a group type whose groups have no participants in the period', async () => {
    withData(
      [
        { Group_ID: 1, Group_Type_ID: 1, Ministry_ID: null },
        { Group_ID: 2, Group_Type_ID: 3, Ministry_ID: null },
      ],
      [
        { Group_Type_ID: 1, Group_Type: 'Small Group' },
        { Group_Type_ID: 3, Group_Type: 'Class' },
      ],
      [{ Group_Participant_ID: 1, Group_ID: 1, Participant_ID: 1 }],
    );
    const service = await getPrivates();
    const result = await service.getGroupTypeMetrics(start, end);
    expect(result.map((r) => r.groupTypeName)).toEqual(['Small Group']);
  });

  it('takes ministryId from the first group of that type that has a participant', async () => {
    // Current behaviour: one ministryId per type, from whichever group's row
    // is seen first. Types spanning ministries report only one of them.
    withData(
      [
        { Group_ID: 1, Group_Type_ID: 1, Ministry_ID: 50 },
        { Group_ID: 2, Group_Type_ID: 1, Ministry_ID: 60 },
      ],
      [{ Group_Type_ID: 1, Group_Type: 'Small Group' }],
      [
        { Group_Participant_ID: 1, Group_ID: 2, Participant_ID: 1 },
        { Group_Participant_ID: 2, Group_ID: 1, Participant_ID: 2 },
      ],
    );
    const service = await getPrivates();
    const [metric] = await service.getGroupTypeMetrics(start, end);
    expect(metric.ministryId).toBe(60);
  });

  it('batches Group_Participants reads 100 group IDs at a time', async () => {
    const groups = Array.from({ length: 150 }, (_, i) => ({ Group_ID: i + 1, Group_Type_ID: 1, Ministry_ID: null }));
    const participants = groups.map((g) => ({ Group_Participant_ID: g.Group_ID, Group_ID: g.Group_ID, Participant_ID: g.Group_ID }));
    withData(groups, [{ Group_Type_ID: 1, Group_Type: 'Small Group' }], participants);
    const service = await getPrivates();

    const [metric] = await service.getGroupTypeMetrics(start, end);

    const batches = callsFor('Group_Participants').map((c) => inList(c.filter, 'Group_Participants.Group_ID'));
    expect(batches.map((b) => b.length)).toEqual([100, 50]);
    expect(batches.flat()).toEqual(groups.map((g) => g.Group_ID));
    expect(metric).toMatchObject({ activeGroupCount: 150, totalParticipants: 150, uniqueParticipants: 150, averageGroupSize: 1 });
  });

  it.each(['Groups', 'Group_Types', 'Group_Participants'])(
    'logs and returns [] when the %s query fails',
    async (failingTable) => {
      mockGetTableRecords.mockImplementation((p: QueryParams) => {
        if (p.table === failingTable) return Promise.reject(new Error('timeout'));
        if (p.table === 'Groups') return Promise.resolve([{ Group_ID: 1, Group_Type_ID: 1, Ministry_ID: null }]);
        if (p.table === 'Group_Types') return Promise.resolve([{ Group_Type_ID: 1, Group_Type: 'Small Group' }]);
        return Promise.resolve([{ Group_Participant_ID: 1, Group_ID: 1, Participant_ID: 1 }]);
      });
      const service = await getPrivates();
      await expect(service.getGroupTypeMetrics(start, end)).resolves.toEqual([]);
      expect(console.error).toHaveBeenCalledWith('Error fetching group type metrics:', expect.any(Error));
    },
  );
});

// ---------------------------------------------------------------------------
// mapWithConcurrency — through getMonthlyAttendanceTrends, its only caller
// ---------------------------------------------------------------------------

describe('mapWithConcurrency (via getMonthlyAttendanceTrends)', () => {
  /** Month key ("YYYY-MM") for a monthly Events filter, recomputed from the local month bounds. */
  function monthKeyOf(filter: string): string {
    const m = /Events\.Event_Start_Date >= '([^']+)'/.exec(filter);
    if (!m) throw new Error(`not a monthly Events filter: ${filter}`);
    // The filter carries toISOString() of local midnight on the 1st; shift by
    // 12h so the local date lands safely inside that month in any TZ.
    const d = new Date(new Date(m[1]).getTime() + 12 * 3600 * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /** Expected keys for Sept 2025 – Aug 2026. */
  const MINISTRY_YEAR_KEYS = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2025, 8 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  /**
   * Every MP call takes `delayFor(params)` ms of real time. Tracks how many
   * are in flight at once. Each month's Events call returns one event whose
   * ID encodes the month, and Event_Metrics returns in-person = that ID.
   */
  function instrumented(delayFor: (p: QueryParams) => number = () => 5, fail?: (p: QueryParams) => boolean) {
    const state = { inFlight: 0, maxInFlight: 0 };
    mockGetTableRecords.mockImplementation(async (p: QueryParams) => {
      state.inFlight++;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      try {
        await tick(delayFor(p));
        if (fail?.(p)) throw new Error(`boom ${p.table}`);
        if (p.table === 'Events') {
          const [y, m] = monthKeyOf(p.filter!).split('-').map(Number);
          return [{ Event_ID: y * 100 + m }];
        }
        if (p.table === 'Event_Metrics') {
          const [id] = inList(p.filter, 'Event_Metrics.Event_ID');
          return [{ Event_ID: id, Metric_ID: 2, Numerical_Value: id }];
        }
        return [];
      } finally {
        state.inFlight--;
      }
    });
    return state;
  }

  it('never has more than 6 MP calls in flight, and does use all 6 slots', async () => {
    const state = instrumented();
    const service = await getPrivates();

    const trends = await service.getMonthlyAttendanceTrends(YEAR_START, YEAR_END);

    expect(trends).toHaveLength(12);
    expect(state.maxInFlight).toBe(6);
    // Two sequential calls per month: Events then Event_Metrics.
    expect(callsFor('Events')).toHaveLength(12);
    expect(callsFor('Event_Metrics')).toHaveLength(12);
  });

  it('runs only as many workers as there are months when that is fewer than 6', async () => {
    const state = instrumented();
    const service = await getPrivates();

    // Sept – Nov 2025: three months.
    const trends = await service.getMonthlyAttendanceTrends(new Date(2025, 8, 1), new Date(2025, 10, 30));

    expect(trends.map((t) => t.month)).toEqual(MINISTRY_YEAR_KEYS.slice(0, 3));
    expect(state.maxInFlight).toBe(3);
  });

  it('keeps results in month order even when later months finish first', async () => {
    // Earlier months are slower: September finishes last.
    instrumented((p) => {
      if (p.table !== 'Events') return 1;
      const idx = MINISTRY_YEAR_KEYS.indexOf(monthKeyOf(p.filter!));
      return (12 - idx) * 3;
    });
    const service = await getPrivates();

    const trends = await service.getMonthlyAttendanceTrends(YEAR_START, YEAR_END);

    expect(trends.map((t) => t.month)).toEqual(MINISTRY_YEAR_KEYS);
    expect(trends.map((t) => t.monthName)).toEqual([
      'September', 'October', 'November', 'December', 'January', 'February',
      'March', 'April', 'May', 'June', 'July', 'August',
    ]);
    // Each value belongs to its own month (no cross-wiring from out-of-order completion).
    for (const t of trends) {
      const [y, m] = t.month.split('-').map(Number);
      expect(t.averageInPersonAttendance).toBe(y * 100 + m);
    }
  });

  it('one failing month does not reject the others: it is dropped, logged and counted', async () => {
    const failing = MINISTRY_YEAR_KEYS[4]; // January 2026
    instrumented(
      () => 2,
      (p) => p.table === 'Events' && monthKeyOf(p.filter!) === failing,
    );
    const service = await getPrivates();

    const trends = await service.getMonthlyAttendanceTrends(YEAR_START, YEAR_END);

    expect(trends.map((t) => t.month)).toEqual(MINISTRY_YEAR_KEYS.filter((k) => k !== failing));
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Error fetching attendance for one month:', expect.any(Error));
    expect(console.warn).toHaveBeenCalledWith('Monthly attendance trends: 1/12 months failed, 11 succeeded');
    // The worker that hit the failure kept going: every month was attempted.
    expect(callsFor('Events')).toHaveLength(12);
  });

  it('a failing Event_Metrics read only drops its own month', async () => {
    const failing = MINISTRY_YEAR_KEYS[0];
    const [fy, fm] = failing.split('-').map(Number);
    instrumented(
      () => 2,
      (p) => p.table === 'Event_Metrics' && inList(p.filter, 'Event_Metrics.Event_ID')[0] === fy * 100 + fm,
    );
    const service = await getPrivates();
    const trends = await service.getMonthlyAttendanceTrends(YEAR_START, YEAR_END);
    expect(trends.map((t) => t.month)).toEqual(MINISTRY_YEAR_KEYS.slice(1));
  });

  it('throws when every month fails, so a cache layer keeps its previous good value', async () => {
    instrumented(() => 1, () => true);
    const service = await getPrivates();

    await expect(service.getMonthlyAttendanceTrends(YEAR_START, YEAR_END)).rejects.toThrow(
      'All 12 monthly attendance queries failed',
    );
    expect(console.warn).toHaveBeenCalledWith('Monthly attendance trends: 12/12 months failed, 0 succeeded');
  });

  it('caps the months at today and returns [] (no throw, no calls) for a wholly future range', async () => {
    instrumented();
    const service = await getPrivates();

    // NOW is 2026-11-17: Dec 2026 onwards has no months to query.
    await expect(
      service.getMonthlyAttendanceTrends(new Date(2026, 11, 1), new Date(2027, 7, 31)),
    ).resolves.toEqual([]);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it('stops at the current month when the range runs past today', async () => {
    instrumented();
    const service = await getPrivates();
    const trends = await service.getMonthlyAttendanceTrends(new Date(2026, 8, 1), new Date(2027, 7, 31));
    expect(trends.map((t) => t.month)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('sends each month its own Events filter and sanitized Event_Metrics IDs', async () => {
    mockGetTableRecords.mockImplementation((p: QueryParams) => {
      if (p.table === 'Events') return Promise.resolve([{ Event_ID: 0 }, { Event_ID: 31 }, { Event_ID: 32 }]);
      return Promise.resolve([]);
    });
    const service = await getPrivates();
    await service.getMonthlyAttendanceTrends(new Date(2025, 8, 1), new Date(2025, 8, 30));

    const monthStart = new Date(2025, 8, 1).toISOString();
    const monthEnd = new Date(2025, 9, 0).toISOString();
    expect(callsFor('Events')).toEqual([
      {
        table: 'Events',
        select: 'Event_ID',
        filter: `Events.Event_Start_Date >= '${monthStart}' AND Events.Event_End_Date <= '${monthEnd}' AND Events.Cancelled = 0 AND Events.Event_Type_ID = 7`,
      },
    ]);
    expect(callsFor('Event_Metrics')).toEqual([
      {
        table: 'Event_Metrics',
        select: 'Event_ID,Metric_ID,Numerical_Value',
        filter: 'Event_Metrics.Event_ID IN (31,32) AND Event_Metrics.Metric_ID IN (2, 3)',
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// getDashboardData
// ---------------------------------------------------------------------------

describe('getDashboardData', () => {
  // Local-time bounds, as callers build them, so month bucketing is TZ-independent.
  const start = new Date(2025, 8, 1);
  const end = new Date(2026, 7, 31, 23, 59, 59);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const prevStart = new Date(2024, 8, 1).toISOString();
  const prevEnd = new Date(2025, 7, 31, 23, 59, 59).toISOString();

  /**
   * Routes every query getDashboardData fans out to. Period queries (multi-line
   * filters) answer per year; monthly ones (single-line) return nothing, so
   * those months succeed with zeros.
   */
  function dispatcher(overrides: (p: QueryParams) => unknown = () => undefined) {
    mockGetTableRecords.mockImplementation((p: QueryParams) => {
      const o = overrides(p);
      if (o !== undefined) return o instanceof Promise ? o : Promise.resolve(o);
      const f = p.filter ?? '';
      if (p.table === 'Events' && p.select === 'Event_ID' && f.includes('\n')) {
        if (f.includes(start.toISOString())) return Promise.resolve([{ Event_ID: 1 }]);
        if (f.includes(prevStart)) return Promise.resolve([{ Event_ID: 2 }]);
      }
      if (p.table === 'Event_Metrics' && p.select === 'Event_Metric_ID,Event_ID,Metric_ID,Numerical_Value') {
        const [id] = inList(f, 'Event_Metrics.Event_ID');
        return Promise.resolve([{ Event_Metric_ID: id, Event_ID: id, Metric_ID: 2, Numerical_Value: id === 1 ? 300 : 250 }]);
      }
      if (p.table === 'Groups' && p.select === 'Group_ID,Group_Type_ID,Ministry_ID') {
        return Promise.resolve([{ Group_ID: 5, Group_Type_ID: 1, Ministry_ID: 9 }]);
      }
      if (p.table === 'Group_Types') return Promise.resolve([{ Group_Type_ID: 1, Group_Type: 'Small Group' }]);
      if (p.table === 'Group_Participants') {
        return Promise.resolve([{ Group_Participant_ID: 1, Group_ID: 5, Participant_ID: 77 }]);
      }
      if (p.table === 'Participant_Milestones') {
        const id = Number(/Milestone_ID = (\d+)/.exec(f)?.[1]);
        return Promise.resolve([{ Date_Accomplished: `milestone-${id}` }]);
      }
      return Promise.resolve([]);
    });
  }

  it('compares the current period with the same dates one year earlier', async () => {
    dispatcher();
    const service = await DashboardService.getInstance();

    const data = await service.getDashboardData(start, end);

    expect(data.currentPeriod).toMatchObject({
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      totalEvents: 1,
      averageInPersonAttendance: 300,
    });
    expect(data.previousPeriod).toMatchObject({
      periodStart: prevStart,
      periodEnd: prevEnd,
      totalEvents: 1,
      averageInPersonAttendance: 250,
    });
    // The caller's Date objects are not mutated by the year-shift.
    expect(start.toISOString()).toBe(startIso);
    expect(end.toISOString()).toBe(endIso);
  });

  it('maps each milestone query to its field (3 baptism, 48 member, 51 associate, 52 youth)', async () => {
    dispatcher();
    const service = await DashboardService.getInstance();

    const data = await service.getDashboardData(start, end);

    expect(data.baptismDates).toEqual(['milestone-3']);
    expect(data.membershipDates).toEqual(['milestone-48']);
    expect(data.associateMemberDates).toEqual(['milestone-51']);
    expect(data.youthMemberDates).toEqual(['milestone-52']);
    for (const c of callsFor('Participant_Milestones')) {
      expect(c.select).toBe('Date_Accomplished');
      expect(c.filter).toMatch(
        new RegExp(`^Milestone_ID = \\d+ AND Date_Accomplished >= '${start.toISOString()}' AND Date_Accomplished <= '${end.toISOString()}'$`),
      );
    }
  });

  it('includes current-year group type metrics and monthly trends for both years', async () => {
    dispatcher();
    const service = await DashboardService.getInstance();

    const data = await service.getDashboardData(start, end);

    expect(data.groupTypeMetrics).toEqual([
      {
        groupTypeId: 1,
        groupTypeName: 'Small Group',
        ministryId: 9,
        activeGroupCount: 1,
        totalParticipants: 1,
        uniqueParticipants: 1,
        averageGroupSize: 1,
      },
    ]);
    // Group type metrics are only fetched for the current year.
    const groupsCalls = callsFor('Groups', 'Group_ID,Group_Type_ID,Ministry_ID');
    expect(groupsCalls).toHaveLength(1);
    expect(groupsCalls[0].filter).toContain(end.toISOString());

    expect(data.monthlyAttendanceTrends).toHaveLength(12);
    expect(data.monthlyAttendanceTrends[0].month).toBe('2025-09');
    expect(data.previousYearMonthlyAttendanceTrends).toHaveLength(12);
    expect(data.previousYearMonthlyAttendanceTrends[0].month).toBe('2024-09');
  });

  it('leaves client-computed and separately-loaded fields at their defaults', async () => {
    dispatcher();
    const service = await DashboardService.getInstance();

    const data = await service.getDashboardData(start, end);

    expect(data).toMatchObject({
      yearOverYear: [],
      previousYearSmallGroupTrends: [],
      previousYearCommunityAttendanceTrends: [],
      baptismsCurrentPeriod: 0,
      baptismsPreviousPeriod: 0,
      membershipCurrentPeriod: 0,
      membershipPreviousPeriod: 0,
      uniqueEventParticipants: 0,
      eventParticipantsByMonth: [],
      rosterVsAttendance: [],
      rosterMemberRecords: [],
      attendanceByMonth: [],
      servingLeadingRecords: [],
      servingTrends: [],
      previousYearServingTrends: [],
      servingByRoleType: [],
      servingByMinistry: [],
      totalServingLeading: 0,
      engagementOverlap: {
        activityOnly: 0, groupOnly: 0, servingOnly: 0,
        activityAndGroup: 0, activityAndServing: 0, groupAndServing: 0,
        allThree: 0, totalActivity: 0, totalGroup: 0, totalServing: 0,
      },
      engagementRawData: { activityByMonth: [], groupRecords: [], adultContactIds: [] },
      generatedAt: NOW.toISOString(),
    });
    // No extended/engagement-only tables are read on the core path.
    const tables = new Set(calls().map((c) => c.table));
    for (const t of ['Activity_Log', 'Contacts', 'Responses']) expect(tables.has(t)).toBe(false);
  });

  it('degrades a failing section to its fallback instead of failing the whole dashboard', async () => {
    dispatcher((p) => {
      if (p.table === 'Participant_Milestones') return Promise.reject(new Error('timeout'));
      if (p.table === 'Groups' && p.select === 'Group_ID,Group_Type_ID,Ministry_ID') return Promise.reject(new Error('timeout'));
      return undefined;
    });
    const service = await DashboardService.getInstance();

    const data = await service.getDashboardData(start, end);

    expect(data.baptismDates).toEqual([]);
    expect(data.youthMemberDates).toEqual([]);
    expect(data.groupTypeMetrics).toEqual([]);
    expect(data.currentPeriod.totalEvents).toBe(1); // unaffected sections still populate
  });

  it('rejects when every monthly attendance query fails (load-bearing for stale-while-revalidate)', async () => {
    dispatcher((p) => {
      const f = p.filter ?? '';
      if (p.table === 'Events' && p.select === 'Event_ID' && !f.includes('\n')) {
        return Promise.reject(new Error('ConnectTimeoutError'));
      }
      return undefined;
    });
    const service = await DashboardService.getInstance();

    await expect(service.getDashboardData(start, end)).rejects.toThrow(/All 12 monthly attendance queries failed/);
  });
});
