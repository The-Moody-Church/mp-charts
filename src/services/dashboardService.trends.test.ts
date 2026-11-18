/**
 * DashboardService trend builders (#302): getSmallGroupTrends,
 * getCommunityAttendanceTrends, getMonthlyAttendanceTrends,
 * getWeeklyAttendanceTrends, getMilestoneDates, getEventParticipantsByMonth.
 *
 * These are private. Wiring is checked through the public getDashboardData /
 * getExtendedDashboardData (with their other private collaborators stubbed);
 * the per-method behaviour is driven directly through a typed view of the
 * private methods (`priv(svc)`), because reaching every branch through
 * getDashboardData would mean faking a dozen unrelated MP queries per test.
 *
 * Timezone: MP returns zone-less Central wall-clock strings
 * ("2025-09-07T10:00:00"). Every day/month bucket key is now sliced from that
 * string, so no result depends on the process zone (the "whatever the process
 * zone" tests switch it with `inTimeZone` to prove it; they used to key by
 * `toISOString()`, which moved an evening service to the next day off UTC).
 * The file still pins process.env.TZ to production's UTC for its own run
 * (Node re-reads TZ on assignment) and restores it afterwards.
 *
 * Date bounds: every range filter is half-open on MP wall-clock day strings
 * (`>= 'YYYY-MM-DD 00:00:00' AND < '<day after the end> 00:00:00'`, built by
 * mp-date-range.ts), so the expected filter strings are literal and do not
 * depend on the process timezone.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import type {
  SmallGroupTrend,
  CommunityAttendanceTrend,
  MonthlyAttendanceTrend,
  WeeklyAttendanceTrend,
  EventParticipantMonth,
} from '@/lib/dto';

const mockGetTableRecords = vi.fn();
// The service-layer cache would otherwise keep Group_Types between tests, so it
// passes straight through to the fetcher; recording the call lets a test check
// the key and TTL the code asks for (caching.md: every 'use cache' fetch goes
// through serviceCache.getOrFetch).
const { mockGetOrFetch } = vi.hoisted(() => ({
  mockGetOrFetch: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
}));

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

vi.mock('@/lib/service-cache', () => ({
  serviceCache: { getOrFetch: mockGetOrFetch },
  CACHE_TTL: { STANDARD: 21_600_000, LONG: 86_400_000 },
}));

import { DashboardService } from '@/services/dashboardService';

// Pin the timezone to production's (see the header). Set before any describe
// body runs, so the module-level fixture dates below are built in UTC too.
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'UTC';
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

interface Call {
  table: string;
  select?: string;
  filter?: string;
}

/** Typed view of the private methods under test. */
interface Privates {
  getSmallGroupTrends(start: Date, end: Date): Promise<SmallGroupTrend[]>;
  getCommunityAttendanceTrends(
    start: Date,
    end: Date,
  ): Promise<{ monthly: CommunityAttendanceTrend[]; weekly: CommunityAttendanceTrend[] }>;
  getMonthlyAttendanceTrends(start: Date, end: Date): Promise<MonthlyAttendanceTrend[]>;
  getWeeklyAttendanceTrends(start: Date, end: Date): Promise<WeeklyAttendanceTrend[]>;
  getMilestoneDates(milestoneId: number, start: Date, end: Date): Promise<string[]>;
  getEventParticipantsByMonth(start: Date, end: Date): Promise<EventParticipantMonth[]>;
}
const priv = (svc: DashboardService) => svc as unknown as Privates;

// A per-request instance (access token) so no test shares the singleton.
const newService = () => DashboardService.getInstance('test-token');

const calls = (table: string): Call[] =>
  mockGetTableRecords.mock.calls.map(c => c[0] as Call).filter(c => c.table === table);

/** An MP/SQL datetime literal normalised for comparison: 'T' -> ' ', fractional
 *  seconds and a trailing Z dropped (SQL Server's datetime ignores the Z). */
const normDt = (v: string) => v.replace('T', ' ').replace(/(\.\d+)?Z?$/, '');

/**
 * A small fake of MP's date predicates: does `row` satisfy every
 * `<col> <op> '<datetime>'` comparison in `filter`? Lets a test feed MP-shaped
 * rows through whatever filter the code sends, so a bound that cuts off the
 * last day shows up as a missing row, not just as a different string.
 */
const matchesDatePredicates = (filter: string | undefined, row: Record<string, unknown>): boolean => {
  for (const [, colRef, op, literal] of (filter ?? '').matchAll(/(\S+) (>=|<=|<|>) '([^']+)'/g)) {
    const value = row[colRef.split('.').pop()!];
    if (typeof value !== 'string') return false;
    const a = normDt(value);
    const b = normDt(literal);
    const ok = op === '>=' ? a >= b : op === '<=' ? a <= b : op === '<' ? a < b : a > b;
    if (!ok) return false;
  }
  return true;
};

/** Collapse the multi-line template filters so substring checks are stable. */
const squash = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Run `fn` with the process in another time zone, then put UTC back. Bucket keys
 * must come from the MP wall-clock string, not from parsing it in the process zone.
 */
const inTimeZone = async <T>(tz: string, fn: () => Promise<T>): Promise<T> => {
  process.env.TZ = tz;
  try {
    return await fn();
  } finally {
    process.env.TZ = 'UTC';
  }
};

/** The comma-separated list inside a filter's first `IN (...)`. */
const inList = (filter: string | undefined): string[] => {
  const m = /IN \(([^)]*)\)/.exec(filter ?? '');
  if (!m) throw new Error(`no IN list in ${filter}`);
  return m[1].split(',');
};

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockGetTableRecords.mockReset();
  mockGetTableRecords.mockResolvedValue([]);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// getSmallGroupTrends
// ---------------------------------------------------------------------------
describe('getSmallGroupTrends', () => {
  const START = new Date(2025, 8, 1); // Sep 1 2025, local
  const END = new Date(2025, 11, 31); // Dec 31 2025, local

  it('queries Groups for types 1, 3 and 11 overlapping the range', async () => {
    const svc = await newService();
    await priv(svc).getSmallGroupTrends(START, END);

    const [groups] = calls('Groups');
    expect(groups.select).toBe('Group_ID,Group_Type_ID,Start_Date,End_Date');
    const f = squash(groups.filter);
    expect(f).toContain('Group_Type_ID IN (1, 3, 11)');
    expect(f).toContain(`Groups.Start_Date < '2026-01-01 00:00:00'`);
    expect(f).toContain(`(Groups.End_Date IS NULL OR Groups.End_Date >= '2025-09-01 00:00:00')`);
  });

  it('returns [] without resolving group types when no groups match', async () => {
    const svc = await newService();
    await expect(priv(svc).getSmallGroupTrends(START, END)).resolves.toEqual([]);
    expect(calls('Group_Types')).toHaveLength(0);
  });

  it('counts groups active in each month per type name, one entry per month', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') {
        return Promise.resolve([
          // Small group from mid-September, open-ended
          { Group_ID: 1, Group_Type_ID: 1, Start_Date: '2025-09-15T00:00:00', End_Date: null },
          // Class that ends in October
          { Group_ID: 2, Group_Type_ID: 3, Start_Date: '2025-08-01T00:00:00', End_Date: '2025-10-10T00:00:00' },
          // Small group that ended exactly at the start of September: still active in Sep
          { Group_ID: 4, Group_Type_ID: 1, Start_Date: '2024-01-01T00:00:00', End_Date: '2025-09-01T00:00:00' },
          // Community starting in December
          { Group_ID: 3, Group_Type_ID: 11, Start_Date: '2025-12-02T00:00:00', End_Date: null },
        ]);
      }
      if (p.table === 'Group_Types') {
        return Promise.resolve([
          { Group_Type_ID: 1, Group_Type: 'Small Group' },
          { Group_Type_ID: 3, Group_Type: 'Class' },
          // 11 deliberately missing: falls back to "Type 11"
        ]);
      }
      return Promise.resolve([]);
    });

    const svc = await newService();
    const trends = await priv(svc).getSmallGroupTrends(START, END);

    expect(trends).toEqual([
      { month: '2025-09', monthName: 'September', activeGroupCount: 3, groupCountByType: { 'Small Group': 2, Class: 1 } },
      { month: '2025-10', monthName: 'October', activeGroupCount: 2, groupCountByType: { 'Small Group': 1, Class: 1 } },
      { month: '2025-11', monthName: 'November', activeGroupCount: 1, groupCountByType: { 'Small Group': 1 } },
      { month: '2025-12', monthName: 'December', activeGroupCount: 2, groupCountByType: { 'Small Group': 1, 'Type 11': 1 } },
    ]);

    // Group types are looked up once, for exactly the types present. The order
    // inside the IN list is a cache-key detail, so compare as a set.
    const gt = calls('Group_Types');
    expect(gt).toHaveLength(1);
    expect(gt[0].select).toBe('Group_Type_ID,Group_Type');
    expect(gt[0].filter).toMatch(/^Group_Type_ID IN \([\d,]+\)$/);
    expect(inList(gt[0].filter).map(Number).sort((a, b) => a - b)).toEqual([1, 3, 11]);
  });

  it('reads group types through serviceCache under a group-types key with the LONG TTL', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') {
        return Promise.resolve([
          { Group_ID: 1, Group_Type_ID: 3, Start_Date: '2025-09-01T00:00:00', End_Date: null },
          { Group_ID: 2, Group_Type_ID: 1, Start_Date: '2025-09-01T00:00:00', End_Date: null },
        ]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    await priv(svc).getSmallGroupTrends(START, END);

    const gtCalls = mockGetOrFetch.mock.calls.filter(([key]) => key.startsWith('group-types:'));
    expect(gtCalls).toHaveLength(1);
    const [key, ttl] = gtCalls[0];
    expect(key.slice('group-types:'.length).split(',').map(Number).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(ttl).toBe(86_400_000);
    // The MP read happens inside the cached fetcher, not beside it.
    expect(calls('Group_Types')).toHaveLength(1);
  });

  it('emits a zero-count month when no group is active in it', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') {
        return Promise.resolve([
          { Group_ID: 9, Group_Type_ID: 1, Start_Date: '2025-12-05T00:00:00', End_Date: null },
        ]);
      }
      if (p.table === 'Group_Types') return Promise.resolve([{ Group_Type_ID: 1, Group_Type: 'Small Group' }]);
      return Promise.resolve([]);
    });
    const svc = await newService();
    const trends = await priv(svc).getSmallGroupTrends(START, END);
    expect(trends.map(t => t.activeGroupCount)).toEqual([0, 0, 0, 1]);
    expect(trends[0].groupCountByType).toEqual({});
  });

  // Was a bug: monthEnd was `new Date(y, m + 1, 0)`, MIDNIGHT at the START of
  // the last day, so a group starting later that day missed its month.
  it('ends a group that ended on the last day of a month in that month, not the next', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') {
        return Promise.resolve([
          { Group_ID: 6, Group_Type_ID: 1, Start_Date: '2025-01-01 00:00:00', End_Date: '2025-10-31 18:00:00' },
        ]);
      }
      if (p.table === 'Group_Types') return Promise.resolve([{ Group_Type_ID: 1, Group_Type: 'Small Group' }]);
      return Promise.resolve([]);
    });
    const svc = await newService();
    const trends = await priv(svc).getSmallGroupTrends(START, END);
    expect(trends.map(t => t.activeGroupCount)).toEqual([1, 1, 0, 0]);
  });

  it('counts a group starting during the last day of a month in that month', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') {
        return Promise.resolve([
          { Group_ID: 5, Group_Type_ID: 1, Start_Date: '2025-11-30T10:00:00', End_Date: null },
        ]);
      }
      if (p.table === 'Group_Types') return Promise.resolve([{ Group_Type_ID: 1, Group_Type: 'Small Group' }]);
      return Promise.resolve([]);
    });
    const svc = await newService();
    const trends = await priv(svc).getSmallGroupTrends(new Date(2025, 10, 1), new Date(2025, 11, 31));
    expect(trends.find(t => t.month === '2025-11')!.activeGroupCount).toBe(1);
    expect(trends.find(t => t.month === '2025-12')!.activeGroupCount).toBe(1);
  });

  // The month window is half-open: a group starting at 00:00 on the 1st of the
  // next month is not active in this one (pins `< endExclusiveDay`, not `<=`).
  it('does not count a group starting on the 1st of the next month in this month', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') {
        return Promise.resolve([
          { Group_ID: 7, Group_Type_ID: 1, Start_Date: '2025-11-01T00:00:00', End_Date: null },
        ]);
      }
      if (p.table === 'Group_Types') return Promise.resolve([{ Group_Type_ID: 1, Group_Type: 'Small Group' }]);
      return Promise.resolve([]);
    });
    const svc = await newService();
    const trends = await priv(svc).getSmallGroupTrends(new Date(2025, 9, 1), new Date(2025, 10, 30));
    expect(trends.map(t => [t.month, t.activeGroupCount])).toEqual([['2025-10', 0], ['2025-11', 1]]);
  });

  // Was a latent bug: the cursor was the raw startDate advanced with
  // setMonth(+1), so Jan 31 overflowed to Mar 3 and February was skipped.
  it('does not skip a month when the start date is on the 31st', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') {
        return Promise.resolve([{ Group_ID: 1, Group_Type_ID: 1, Start_Date: '2025-01-01T00:00:00', End_Date: null }]);
      }
      if (p.table === 'Group_Types') return Promise.resolve([{ Group_Type_ID: 1, Group_Type: 'Small Group' }]);
      return Promise.resolve([]);
    });
    const svc = await newService();
    const trends = await priv(svc).getSmallGroupTrends(new Date(2025, 0, 31), new Date(2025, 3, 30));
    expect(trends.map(t => t.month)).toEqual(['2025-01', '2025-02', '2025-03', '2025-04']);
    expect(trends.map(t => t.monthName)).toEqual(['January', 'February', 'March', 'April']);
  });

  // Was a bug (#304): the catch returned an empty value, which the 'use cache'
  // caller then cached over the previous good value for at least 6h. Rethrowing
  // lets both cache layers keep serving the last good data.
  it('rethrows an MP failure (logged) so the cache keeps its previous value', async () => {
    mockGetTableRecords.mockRejectedValue(new Error('MP down'));
    const svc = await newService();
    await expect(priv(svc).getSmallGroupTrends(START, END)).rejects.toThrow('MP down');
    expect(errorSpy).toHaveBeenCalledWith('Error fetching small group trends:', expect.stringContaining('MP down'));
  });

  it('rejects when the Group_Types read fails after Groups succeeded (no partial result)', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') {
        return Promise.resolve([{ Group_ID: 1, Group_Type_ID: 1, Start_Date: '2025-09-15T00:00:00', End_Date: null }]);
      }
      if (p.table === 'Group_Types') return Promise.reject(new Error('MP down'));
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(priv(svc).getSmallGroupTrends(START, END)).rejects.toThrow('MP down');
    expect(errorSpy).toHaveBeenCalledWith('Error fetching small group trends:', expect.stringContaining('MP down'));
  });
});

// ---------------------------------------------------------------------------
// getCommunityAttendanceTrends
// ---------------------------------------------------------------------------
describe('getCommunityAttendanceTrends', () => {
  const START = new Date(2025, 8, 1);
  const END = new Date(2025, 9, 31);

  const GROUPS = [
    { Group_ID: 11, Group_Name: 'North' },
    { Group_ID: 12, Group_Name: 'South' },
  ];

  // Sep 7, Sep 14 and Oct 5 2025 are Sundays; Sep 10 is a Wednesday.
  const EVENTS = [
    { Event_ID: 101, Event_Start_Date: '2025-09-07T10:00:00' },
    { Event_ID: 102, Event_Start_Date: '2025-09-14T10:00:00' },
    { Event_ID: 103, Event_Start_Date: '2025-09-10T10:00:00' }, // weekday: excluded
    { Event_ID: 104, Event_Start_Date: '2025-10-05T10:00:00' },
    { Event_ID: 105, Event_Start_Date: '2025-11-02T10:00:00' }, // Sunday, after END: excluded
    // 106 is cancelled: absent from the Events response
  ];

  const ep = (id: number, eventId: number, groupId: number, participantId: number) => ({
    Event_Participant_ID: id,
    Event_ID: eventId,
    Group_ID: groupId,
    Participant_ID: participantId,
    Participation_Status_ID: 3,
  });

  const PARTICIPANTS = [
    // North, Sep 7: 3 present
    ep(1, 101, 11, 501), ep(2, 101, 11, 502), ep(3, 101, 11, 503),
    // North, Sep 14: 2 present
    ep(4, 102, 11, 501), ep(5, 102, 11, 504),
    // South, Sep 7: participant 501 also attends South (deduped in unique count)
    ep(6, 101, 12, 501), ep(7, 101, 12, 505),
    // Weekday, out-of-range and cancelled events: all excluded
    ep(8, 103, 11, 506), ep(9, 105, 11, 507), ep(10, 106, 11, 508),
    // North, Oct 5: 1 present
    ep(11, 104, 11, 509),
  ];

  const dispatch = (p: Call) => {
    if (p.table === 'Groups') return Promise.resolve(GROUPS);
    if (p.table === 'Event_Participants') return Promise.resolve(PARTICIPANTS);
    if (p.table === 'Events') return Promise.resolve(EVENTS);
    return Promise.resolve([]);
  };

  it('queries community groups, sanitized participants and non-cancelled events', async () => {
    mockGetTableRecords.mockImplementation(dispatch);
    const svc = await newService();
    await priv(svc).getCommunityAttendanceTrends(START, END);

    expect(calls('Groups')[0]).toMatchObject({ select: 'Group_ID,Group_Name', filter: 'Group_Type_ID = 11' });
    expect(calls('Event_Participants')[0].filter).toBe(
      'Event_Participants.Group_ID IN (11,12) AND Event_Participants.Participation_Status_ID IN (3, 4)',
    );
    const events = calls('Events');
    expect(events).toHaveLength(1);
    expect(events[0].select).toBe('Event_ID,Event_Start_Date');
    // Unique event IDs, in first-seen order, sanitized; cancelled excluded server-side
    expect(events[0].filter).toBe('Event_ID IN (101,102,103,105,106,104) AND Cancelled = 0');
  });

  it('averages per community per month, counts per Sunday, and dedupes unique people', async () => {
    mockGetTableRecords.mockImplementation(dispatch);
    const svc = await newService();
    const { monthly, weekly } = await priv(svc).getCommunityAttendanceTrends(START, END);

    expect(monthly).toEqual([
      // North: 5 attendances over 2 Sundays = 2.5 -> 3. South: 2 over 1.
      // Unique people Sep: 501, 502, 503, 504, 505
      { weekStartDate: '2025-09-01', communityAttendance: { North: 3, South: 2 }, uniqueParticipants: 5 },
      { weekStartDate: '2025-10-01', communityAttendance: { North: 1 }, uniqueParticipants: 1 },
    ]);
    expect(weekly).toEqual([
      // 501 is in both North and South on Sep 7: counted once in the unique total
      { weekStartDate: '2025-09-07', communityAttendance: { North: 3, South: 2 }, uniqueParticipants: 4 },
      { weekStartDate: '2025-09-14', communityAttendance: { North: 2 }, uniqueParticipants: 2 },
      { weekStartDate: '2025-10-05', communityAttendance: { North: 1 }, uniqueParticipants: 1 },
    ]);
  });

  it('builds both series in date order even when MP returns later rows first', async () => {
    // Map insertion order follows the participant rows; reversing them puts
    // October first, so only the sorts restore chronological order.
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(GROUPS);
      if (p.table === 'Event_Participants') return Promise.resolve([...PARTICIPANTS].reverse());
      if (p.table === 'Events') return Promise.resolve(EVENTS);
      return Promise.resolve([]);
    });
    const svc = await newService();
    const { monthly, weekly } = await priv(svc).getCommunityAttendanceTrends(START, END);
    expect(monthly.map(m => m.weekStartDate)).toEqual(['2025-09-01', '2025-10-01']);
    expect(weekly.map(w => w.weekStartDate)).toEqual(['2025-09-07', '2025-09-14', '2025-10-05']);
  });

  it('drops a malformed Group_ID from the participants filter instead of interpolating it', async () => {
    // MP data is untrusted in a filter: a non-numeric Group_ID must never reach
    // the IN clause verbatim (sanitizeIds, not a bare join).
    const hostile = [...GROUPS, { Group_ID: '1 OR 1=1' as unknown as number, Group_Name: 'Evil' }];
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(hostile);
      return Promise.resolve([]);
    });
    const svc = await newService();
    await priv(svc).getCommunityAttendanceTrends(START, END);
    const [epCall] = calls('Event_Participants');
    expect(epCall.filter).toBe(
      'Event_Participants.Group_ID IN (11,12) AND Event_Participants.Participation_Status_ID IN (3, 4)',
    );
    expect(epCall.filter).not.toContain('OR 1=1');
  });

  it('never queries participants when every Group_ID is malformed', async () => {
    mockGetTableRecords.mockImplementation((p: Call) =>
      Promise.resolve(
        p.table === 'Groups' ? [{ Group_ID: '0) OR (1=1' as unknown as number, Group_Name: 'Evil' }] : [],
      ),
    );
    const svc = await newService();
    // sanitizeIds throws on an all-invalid list and the method rethrows it
    // (malformed MP data fails rather than caching empty series). No query is sent.
    await expect(priv(svc).getCommunityAttendanceTrends(START, END)).rejects.toThrow();
    expect(calls('Event_Participants')).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith('Error fetching community attendance trends:', expect.any(String));
  });

  it('labels a participant row whose group is not a known community "Unknown"', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(GROUPS);
      if (p.table === 'Event_Participants') return Promise.resolve([ep(1, 101, 99, 501)]);
      if (p.table === 'Events') return Promise.resolve(EVENTS);
      return Promise.resolve([]);
    });
    const svc = await newService();
    const { weekly } = await priv(svc).getCommunityAttendanceTrends(START, END);
    expect(weekly).toEqual([{ weekStartDate: '2025-09-07', communityAttendance: { Unknown: 1 }, uniqueParticipants: 1 }]);
  });

  // Was a bug: `date > endDate` with endDate = Aug 31 00:00 dropped the
  // Sunday Aug 31 2025 service from the ministry year it closes.
  it('includes a Sunday on the last day of the range (Aug 31)', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(GROUPS);
      if (p.table === 'Event_Participants') return Promise.resolve([ep(1, 201, 11, 501), ep(2, 202, 11, 502)]);
      if (p.table === 'Events') {
        return Promise.resolve([
          { Event_ID: 201, Event_Start_Date: '2025-08-31T10:00:00' },
          { Event_ID: 202, Event_Start_Date: '2025-09-07T10:00:00' }, // after the range
        ]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    const { monthly, weekly } = await priv(svc).getCommunityAttendanceTrends(new Date(2024, 8, 1), new Date(2025, 7, 31));
    expect(weekly).toEqual([{ weekStartDate: '2025-08-31', communityAttendance: { North: 1 }, uniqueParticipants: 1 }]);
    expect(monthly).toEqual([{ weekStartDate: '2025-08-01', communityAttendance: { North: 1 }, uniqueParticipants: 1 }]);
  });

  // The Events read has no date filter, so the in-code check is the only date
  // bound. Sep 1 2024 (the first day) and Aug 31 2025 (the day after Aug 30)
  // are both Sundays: the first is in, the second is out.
  it('includes a Sunday on the first day of the range and excludes one on the day after it', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(GROUPS);
      if (p.table === 'Event_Participants') {
        return Promise.resolve([ep(1, 301, 11, 501), ep(2, 302, 11, 502), ep(3, 303, 11, 503)]);
      }
      if (p.table === 'Events') {
        return Promise.resolve([
          { Event_ID: 301, Event_Start_Date: '2024-08-25T10:00:00' }, // Sunday before the range
          { Event_ID: 302, Event_Start_Date: '2024-09-01T10:00:00' }, // Sunday, first day
          { Event_ID: 303, Event_Start_Date: '2025-08-31T10:00:00' }, // Sunday, day after the range
        ]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    const { weekly } = await priv(svc).getCommunityAttendanceTrends(new Date(2024, 8, 1), new Date(2025, 7, 30));
    expect(weekly.map(w => w.weekStartDate)).toEqual(['2024-09-01']);
  });

  it('keys an evening Sunday service by its own day and month, whatever the process zone', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(GROUPS);
      if (p.table === 'Event_Participants') return Promise.resolve([ep(1, 401, 11, 501)]);
      if (p.table === 'Events') return Promise.resolve([{ Event_ID: 401, Event_Start_Date: '2025-08-31T19:30:00' }]);
      return Promise.resolve([]);
    });
    for (const tz of ['America/Chicago', 'Pacific/Auckland']) {
      const { monthly, weekly } = await inTimeZone(tz, async () => {
        const svc = await newService();
        return priv(svc).getCommunityAttendanceTrends(new Date(2025, 7, 1), new Date(2025, 7, 31));
      });
      expect(weekly.map(w => w.weekStartDate), tz).toEqual(['2025-08-31']);
      expect(monthly.map(w => w.weekStartDate), tz).toEqual(['2025-08-01']);
    }
  });

  it('returns empty series without further queries when there are no community groups', async () => {
    const svc = await newService();
    await expect(priv(svc).getCommunityAttendanceTrends(START, END)).resolves.toEqual({ monthly: [], weekly: [] });
    expect(calls('Event_Participants')).toHaveLength(0);
    expect(calls('Events')).toHaveLength(0);
  });

  it('returns empty series without an Events query when nobody attended', async () => {
    mockGetTableRecords.mockImplementation((p: Call) =>
      Promise.resolve(p.table === 'Groups' ? GROUPS : []),
    );
    const svc = await newService();
    await expect(priv(svc).getCommunityAttendanceTrends(START, END)).resolves.toEqual({ monthly: [], weekly: [] });
    expect(calls('Events')).toHaveLength(0);
  });

  it('returns empty series when no attendance falls on an in-range Sunday', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(GROUPS);
      if (p.table === 'Event_Participants') return Promise.resolve([ep(8, 103, 11, 506)]);
      if (p.table === 'Events') return Promise.resolve(EVENTS);
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(priv(svc).getCommunityAttendanceTrends(START, END)).resolves.toEqual({ monthly: [], weekly: [] });
  });

  it('batches the Events lookup in groups of 100 IDs', async () => {
    const many = Array.from({ length: 150 }, (_, i) => ep(i + 1, 1000 + i, 11, 2000 + i));
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(GROUPS);
      if (p.table === 'Event_Participants') return Promise.resolve(many);
      return Promise.resolve([]);
    });
    const svc = await newService();
    await priv(svc).getCommunityAttendanceTrends(START, END);
    const events = calls('Events');
    expect(events).toHaveLength(2);
    expect(inList(events[0].filter)).toHaveLength(100);
    expect(inList(events[1].filter)).toHaveLength(50);
  });

  // Was a bug (#304): the catch returned an empty value, which the 'use cache'
  // caller then cached over the previous good value for at least 6h. Rethrowing
  // lets both cache layers keep serving the last good data.
  it('rethrows an MP failure (logged) so the cache keeps its previous value', async () => {
    mockGetTableRecords.mockRejectedValue(new Error('MP down'));
    const svc = await newService();
    await expect(priv(svc).getCommunityAttendanceTrends(START, END)).rejects.toThrow('MP down');
    expect(errorSpy).toHaveBeenCalledWith(
      'Error fetching community attendance trends:',
      expect.stringContaining('MP down'),
    );
  });

  it('rejects when the Events read fails after participants were read (no partial result)', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Groups') return Promise.resolve(GROUPS);
      if (p.table === 'Event_Participants') return Promise.resolve([ep(1, 101, 11, 501)]);
      if (p.table === 'Events') return Promise.reject(new Error('MP down'));
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(priv(svc).getCommunityAttendanceTrends(START, END)).rejects.toThrow('MP down');
    expect(calls('Event_Participants')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getMonthlyAttendanceTrends
// ---------------------------------------------------------------------------
describe('getMonthlyAttendanceTrends', () => {
  const START = new Date(2025, 8, 1); // Sep 1 2025
  const END = new Date(2026, 7, 31); // Aug 31 2026 (end of ministry year)

  /** Month key ("2025-09") for an Events call, from its start-of-month bound. */
  const monthOf = (filter: string | undefined): string => {
    const m = /Event_Start_Date >= '([^']+)'/.exec(filter ?? '');
    if (!m) throw new Error(`no start bound in ${filter}`);
    return m[1].slice(0, 7);
  };

  beforeEach(() => {
    // Only Date is faked: mapWithConcurrency uses promises, not timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 10, 15, 12)); // Nov 15 2025, mid-ministry-year
  });

  it('caps month iteration at today (no queries for future months)', async () => {
    const svc = await newService();
    const trends = await priv(svc).getMonthlyAttendanceTrends(START, END);

    expect(trends.map(t => t.month)).toEqual(['2025-09', '2025-10', '2025-11']);
    expect(trends.map(t => t.monthName)).toEqual(['September', 'October', 'November']);
    expect(calls('Events').map(c => monthOf(c.filter)).sort()).toEqual(['2025-09', '2025-10', '2025-11']);
  });

  it('caps at the current month in Central time, not UTC', async () => {
    // 03:00 UTC on Dec 1 is still 21:00 on Nov 30 in Chicago: December has not
    // started in MP time, so it is not queried. (The old UTC "today" cap
    // queried an empty December here.)
    vi.setSystemTime(new Date('2025-12-01T03:00:00Z'));
    const svc = await newService();
    const trends = await priv(svc).getMonthlyAttendanceTrends(START, END);
    expect(trends.map(t => t.month)).toEqual(['2025-09', '2025-10', '2025-11']);
    expect(calls('Events')).toHaveLength(3);
  });

  it('iterates to endDate when the whole range is in the past', async () => {
    vi.setSystemTime(new Date(2027, 0, 1));
    const svc = await newService();
    const trends = await priv(svc).getMonthlyAttendanceTrends(START, END);
    expect(trends).toHaveLength(12);
    expect(trends[0].month).toBe('2025-09');
    expect(trends[11]).toMatchObject({ month: '2026-08', monthName: 'August' });
  });

  it('starts at the first of the start month even if startDate is mid-month', async () => {
    const svc = await newService();
    await priv(svc).getMonthlyAttendanceTrends(new Date(2025, 9, 20), END);
    const filters = calls('Events').map(c => c.filter!);
    expect(filters.some(f => f.includes(`Events.Event_Start_Date >= '2025-10-01 00:00:00'`))).toBe(true);
  });

  it('queries worship services (type 7, not cancelled) per month, then metrics 2/3 with sanitized IDs', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events' && monthOf(p.filter) === '2025-09') {
        return Promise.resolve([{ Event_ID: 7001 }, { Event_ID: 7002 }]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    await priv(svc).getMonthlyAttendanceTrends(START, END);

    const sep = calls('Events').find(c => monthOf(c.filter) === '2025-09')!;
    expect(sep.select).toBe('Event_ID');
    // Half-open on Event_Start_Date: the whole of Sep 30 is in, Oct 1 is out.
    expect(sep.filter).toBe(
      "Events.Event_Start_Date >= '2025-09-01 00:00:00' AND Events.Event_Start_Date < '2025-10-01 00:00:00' AND Events.Cancelled = 0 AND Events.Event_Type_ID = 7",
    );

    const metrics = calls('Event_Metrics');
    // Only the month that had events queries metrics
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toEqual({
      table: 'Event_Metrics',
      select: 'Event_ID,Metric_ID,Numerical_Value',
      filter: 'Event_Metrics.Event_ID IN (7001,7002) AND Event_Metrics.Metric_ID IN (2, 3)',
    });
  });

  // Was a bug: the month end bound was MIDNIGHT at the start of the month's
  // last day, so the Sunday services on Nov 30 2025 and Aug 31 2025 fell out
  // of their month. Rows go through a fake of MP's date predicates, so this
  // checks the rows returned, not just the filter text.
  it('counts a service on the last day of the month in that month', async () => {
    vi.setSystemTime(new Date(2025, 11, 15, 12));
    const EVENTS = [
      { Event_ID: 1, Event_Start_Date: '2025-11-30T10:00:00', Event_End_Date: '2025-11-30T11:30:00' },
      { Event_ID: 2, Event_Start_Date: '2025-11-09T10:00:00', Event_End_Date: '2025-11-09T11:30:00' },
    ];
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') {
        return Promise.resolve(
          EVENTS.filter(e => matchesDatePredicates(p.filter, e)).map(e => ({ Event_ID: e.Event_ID })),
        );
      }
      if (p.table === 'Event_Metrics') {
        const ids = inList(p.filter).map(Number);
        return Promise.resolve(
          ids.map(id => ({ Event_ID: id, Metric_ID: 2, Numerical_Value: id === 1 ? 300 : 100 })),
        );
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    const trends = await priv(svc).getMonthlyAttendanceTrends(START, END);

    const nov = trends.find(t => t.month === '2025-11')!;
    expect(nov.eventCount).toBe(2);
    expect(nov.averageInPersonAttendance).toBe(200);
    expect(trends.find(t => t.month === '2025-10')!.eventCount).toBe(0);
    expect(trends.find(t => t.month === '2025-12')!.eventCount).toBe(0);
  });

  it('averages in-person and online independently over the events that reported each', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events' && monthOf(p.filter) === '2025-09') {
        return Promise.resolve([
          { Event_ID: 1 }, { Event_ID: 2 }, { Event_ID: 3 }, { Event_ID: 4 }, { Event_ID: 5 },
        ]);
      }
      if (p.table === 'Event_Metrics') {
        return Promise.resolve([
          { Event_ID: 1, Metric_ID: 2, Numerical_Value: 100 },
          { Event_ID: 1, Metric_ID: 3, Numerical_Value: 51 },
          { Event_ID: 2, Metric_ID: 2, Numerical_Value: 201 },
          // Event 3 has no metrics: not counted in any average
          // Events 4 and 5 reported online only
          { Event_ID: 4, Metric_ID: 3, Numerical_Value: 29 },
          { Event_ID: 5, Metric_ID: 3, Numerical_Value: 20 },
        ]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    const [sep, oct] = await priv(svc).getMonthlyAttendanceTrends(START, END);

    // The three denominators all differ (4 / 2 / 3), so each average proves
    // which event count it divides by.
    expect(sep).toEqual({
      month: '2025-09',
      monthName: 'September',
      averageInPersonAttendance: 151, // (100 + 201) / 2 = 150.5 -> 151
      averageOnlineAttendance: 33, // (51 + 29 + 20) / 3, not diluted by event 2
      averageTotalAttendance: 100, // (301 + 100) / 4 events with any metric = 100.25
      eventCount: 4,
      inPersonEventCount: 2,
      onlineEventCount: 3,
    });
    // A month with no events is a zero row, not missing
    expect(oct).toEqual({
      month: '2025-10',
      monthName: 'October',
      averageInPersonAttendance: 0,
      averageOnlineAttendance: 0,
      averageTotalAttendance: 0,
      eventCount: 0,
      inPersonEventCount: 0,
      onlineEventCount: 0,
    });
  });

  // Was a #304-class bug: one failed month was dropped and the rest returned,
  // so the cache stored a series missing that month over a complete one, and
  // computePeriodMetrics averaged the year without it. Now any failure rejects.
  it('rejects when one month fails, naming the month in the log', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events' && monthOf(p.filter) === '2025-10') {
        return Promise.reject(new Error('ConnectTimeoutError'));
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(priv(svc).getMonthlyAttendanceTrends(START, END)).rejects.toThrow(
      'Monthly attendance trends: 1/3 monthly queries failed',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Error fetching attendance for 2025-10:', expect.stringContaining('ConnectTimeoutError'));
  });

  it('rejects when one month\'s Event_Metrics read fails', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') return Promise.resolve(monthOf(p.filter) === '2025-11' ? [{ Event_ID: 9 }] : []);
      if (p.table === 'Event_Metrics') return Promise.reject(new Error('500'));
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(priv(svc).getMonthlyAttendanceTrends(START, END)).rejects.toThrow('1/3 monthly queries failed');
  });

  it('THROWS when every month fails, so the cache keeps its previous value', async () => {
    mockGetTableRecords.mockRejectedValue(new Error('MP down'));
    const svc = await newService();
    await expect(priv(svc).getMonthlyAttendanceTrends(START, END)).rejects.toThrow(
      'Monthly attendance trends: 3/3 monthly queries failed',
    );
  });

  it('returns [] (no throw) when the range starts after today, without querying', async () => {
    const svc = await newService();
    await expect(
      priv(svc).getMonthlyAttendanceTrends(new Date(2026, 0, 1), new Date(2026, 11, 31)),
    ).resolves.toEqual([]);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it('returns results in month order even when later months answer first', async () => {
    vi.setSystemTime(new Date(2027, 0, 1));
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table !== 'Events') return Promise.resolve([]);
      // Earlier months resolve later
      const month = Number(monthOf(p.filter).slice(5));
      const delay = month >= 9 ? 30 - month : 20 - month;
      return new Promise(r => setTimeout(() => r([]), delay));
    });
    const svc = await newService();
    const trends = await priv(svc).getMonthlyAttendanceTrends(START, END);
    expect(trends.map(t => t.month)).toEqual([
      '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02',
      '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
    ]);
  });

  it('never has more than 6 months in flight against MP', async () => {
    vi.setSystemTime(new Date(2027, 0, 1));
    let inFlight = 0;
    let peak = 0;
    mockGetTableRecords.mockImplementation(() => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      return new Promise(r =>
        setTimeout(() => {
          inFlight--;
          r([]);
        }, 2),
      );
    });
    const svc = await newService();
    const trends = await priv(svc).getMonthlyAttendanceTrends(START, END);
    expect(trends).toHaveLength(12);
    expect(calls('Events')).toHaveLength(12);
    expect(peak).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// getWeeklyAttendanceTrends
// ---------------------------------------------------------------------------
describe('getWeeklyAttendanceTrends', () => {
  const START = new Date(2025, 10, 1);
  const END = new Date(2025, 10, 30);

  it('queries worship services in range, then metrics 2/3 for those events', async () => {
    mockGetTableRecords.mockImplementation((p: Call) =>
      Promise.resolve(p.table === 'Events' ? [{ Event_ID: 1, Event_Start_Date: '2025-11-02T09:00:00' }] : []),
    );
    const svc = await newService();
    await priv(svc).getWeeklyAttendanceTrends(START, END);

    const [events] = calls('Events');
    expect(events.select).toBe('Event_ID,Event_Start_Date');
    expect(squash(events.filter)).toBe(
      "Events.Event_Start_Date >= '2025-11-01 00:00:00' AND " +
        "Events.Event_Start_Date < '2025-12-01 00:00:00' AND " +
        'Events.Cancelled = 0 AND Events.Event_Type_ID = 7',
    );
    expect(calls('Event_Metrics')[0]).toEqual({
      table: 'Event_Metrics',
      select: 'Event_ID,Metric_ID,Numerical_Value',
      filter: 'Event_Metrics.Event_ID IN (1) AND Event_Metrics.Metric_ID IN (2, 3)',
    });
  });

  // Was a bug: `Event_End_Date <= '<Nov 30 00:00>'` dropped the Nov 30 service.
  it('includes a service on the last day of the range', async () => {
    const EVENTS = [
      { Event_ID: 1, Event_Start_Date: '2025-11-30T10:00:00', Event_End_Date: '2025-11-30T11:30:00' },
      { Event_ID: 2, Event_Start_Date: '2025-12-07T10:00:00', Event_End_Date: '2025-12-07T11:30:00' },
    ];
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') {
        return Promise.resolve(
          EVENTS.filter(e => matchesDatePredicates(squash(p.filter), e))
            .map(({ Event_ID, Event_Start_Date }) => ({ Event_ID, Event_Start_Date })),
        );
      }
      if (p.table === 'Event_Metrics') {
        return Promise.resolve(inList(p.filter).map(id => ({ Event_ID: Number(id), Metric_ID: 2, Numerical_Value: 250 })));
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    const trends = await priv(svc).getWeeklyAttendanceTrends(START, END);
    expect(trends.map(t => t.eventDate)).toEqual(['2025-11-30']);
    expect(trends[0].inPersonAttendance).toBe(250);
  });

  it('keys an evening service by its own day, whatever the process zone', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') return Promise.resolve([{ Event_ID: 1, Event_Start_Date: '2025-11-30T19:30:00' }]);
      if (p.table === 'Event_Metrics') return Promise.resolve([{ Event_ID: 1, Metric_ID: 2, Numerical_Value: 90 }]);
      return Promise.resolve([]);
    });
    for (const tz of ['America/Chicago', 'Pacific/Auckland']) {
      const trends = await inTimeZone(tz, async () => {
        const svc = await newService();
        return priv(svc).getWeeklyAttendanceTrends(START, END);
      });
      expect(trends.map(t => t.eventDate), tz).toEqual(['2025-11-30']);
    }
  });

  it('returns [] without a metrics query when there are no services', async () => {
    const svc = await newService();
    await expect(priv(svc).getWeeklyAttendanceTrends(START, END)).resolves.toEqual([]);
    expect(calls('Event_Metrics')).toHaveLength(0);
  });

  it('sums each date across services, sorted by date, with short labels', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') {
        return Promise.resolve([
          { Event_ID: 3, Event_Start_Date: '2025-11-09T10:00:00' },
          { Event_ID: 1, Event_Start_Date: '2025-11-02T09:00:00' },
          { Event_ID: 2, Event_Start_Date: '2025-11-02T11:00:00' },
        ]);
      }
      if (p.table === 'Event_Metrics') {
        // The later date's row comes first: grouping follows metric order, so
        // only the sort puts Nov 2 ahead of Nov 9.
        return Promise.resolve([
          { Event_ID: 3, Metric_ID: 3, Numerical_Value: 70 },
          { Event_ID: 1, Metric_ID: 2, Numerical_Value: 300 },
          { Event_ID: 1, Metric_ID: 3, Numerical_Value: 40 },
          { Event_ID: 2, Metric_ID: 2, Numerical_Value: 250 },
          { Event_ID: 999, Metric_ID: 2, Numerical_Value: 5 }, // unknown event: skipped
        ]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    const trends = await priv(svc).getWeeklyAttendanceTrends(START, END);

    expect(trends).toEqual([
      {
        eventDate: '2025-11-02',
        dateLabel: 'Nov 2',
        inPersonAttendance: 550,
        onlineAttendance: 40,
        totalAttendance: 590,
        eventCount: 2,
        inPersonEventCount: 2,
        onlineEventCount: 1,
      },
      {
        eventDate: '2025-11-09',
        dateLabel: 'Nov 9',
        inPersonAttendance: 0,
        onlineAttendance: 70,
        totalAttendance: 70,
        eventCount: 1,
        inPersonEventCount: 0,
        onlineEventCount: 1,
      },
    ]);
  });

  it('batches Event_Metrics reads in groups of 100 event IDs', async () => {
    const events = Array.from({ length: 205 }, (_, i) => ({
      Event_ID: i + 1,
      Event_Start_Date: '2025-11-02T10:00:00',
    }));
    mockGetTableRecords.mockImplementation((p: Call) => Promise.resolve(p.table === 'Events' ? events : []));
    const svc = await newService();
    await priv(svc).getWeeklyAttendanceTrends(START, END);

    const metrics = calls('Event_Metrics');
    expect(metrics.map(m => inList(m.filter).length)).toEqual([100, 100, 5]);
    expect(metrics[2].filter).toBe(
      'Event_Metrics.Event_ID IN (201,202,203,204,205) AND Event_Metrics.Metric_ID IN (2, 3)',
    );
  });

  // Was a bug (#304): the catch returned an empty value, which the 'use cache'
  // caller then cached over the previous good value for at least 6h. Rethrowing
  // lets both cache layers keep serving the last good data.
  it('rethrows an MP failure (logged) so the cache keeps its previous value', async () => {
    mockGetTableRecords.mockRejectedValue(new Error('MP down'));
    const svc = await newService();
    await expect(priv(svc).getWeeklyAttendanceTrends(START, END)).rejects.toThrow('MP down');
    expect(errorSpy).toHaveBeenCalledWith('Error fetching weekly attendance trends:', expect.stringContaining('MP down'));
  });

  it('rejects when the second Event_Metrics batch fails (no partial result)', async () => {
    const events = Array.from({ length: 150 }, (_, i) => ({ Event_ID: i + 1, Event_Start_Date: '2025-11-02T10:00:00' }));
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') return Promise.resolve(events);
      if (p.table === 'Event_Metrics') {
        return Number(inList(p.filter)[0]) > 100
          ? Promise.reject(new Error('MP down'))
          : Promise.resolve([{ Event_ID: 1, Metric_ID: 2, Numerical_Value: 300 }]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(priv(svc).getWeeklyAttendanceTrends(START, END)).rejects.toThrow('MP down');
    expect(calls('Event_Metrics')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// getMilestoneDates
// ---------------------------------------------------------------------------
describe('getMilestoneDates', () => {
  const START = new Date(2025, 8, 1);
  const END = new Date(2026, 7, 31);

  it('reads Date_Accomplished for one milestone in range and returns the raw values', async () => {
    mockGetTableRecords.mockResolvedValue([
      { Date_Accomplished: '2025-10-05T00:00:00' },
      { Date_Accomplished: '2026-01-11T00:00:00' },
    ]);
    const svc = await newService();
    await expect(priv(svc).getMilestoneDates(3, START, END)).resolves.toEqual([
      '2025-10-05T00:00:00',
      '2026-01-11T00:00:00',
    ]);
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: 'Participant_Milestones',
      select: 'Date_Accomplished',
      filter: "Milestone_ID = 3 AND Date_Accomplished >= '2025-09-01 00:00:00' AND Date_Accomplished < '2026-09-01 00:00:00'",
    });
  });

  // Was a bug (#304): the catch returned an empty value, which the 'use cache'
  // caller then cached over the previous good value for at least 6h. Rethrowing
  // lets both cache layers keep serving the last good data.
  it('rethrows an MP failure (logged) so the cache keeps its previous value', async () => {
    mockGetTableRecords.mockRejectedValue(new Error('MP down'));
    const svc = await newService();
    await expect(priv(svc).getMilestoneDates(48, START, END)).rejects.toThrow('MP down');
    expect(errorSpy).toHaveBeenCalledWith(
      'Error fetching milestone dates for Milestone_ID=48:',
      expect.stringContaining('MP down'),
    );
  });
});

// ---------------------------------------------------------------------------
// getEventParticipantsByMonth
// ---------------------------------------------------------------------------
describe('getEventParticipantsByMonth', () => {
  const START = new Date(2025, 8, 1);
  const END = new Date(2025, 10, 30);

  it('queries non-cancelled events in range, then present participants for them', async () => {
    mockGetTableRecords.mockImplementation((p: Call) =>
      Promise.resolve(
        p.table === 'Events'
          ? [
              { Event_ID: 10, Event_Start_Date: '2025-09-07T10:00:00' },
              { Event_ID: 20, Event_Start_Date: '2025-10-12T10:00:00' },
            ]
          : [],
      ),
    );
    const svc = await newService();
    await priv(svc).getEventParticipantsByMonth(START, END);

    expect(calls('Events')[0]).toEqual({
      table: 'Events',
      select: 'Event_ID,Event_Start_Date',
      filter: "Event_Start_Date >= '2025-09-01 00:00:00' AND Event_Start_Date < '2025-12-01 00:00:00' AND Cancelled = 0",
    });
    expect(calls('Event_Participants')[0]).toEqual({
      table: 'Event_Participants',
      select: 'Event_ID,Participant_ID',
      filter: 'Event_ID IN (10,20) AND Participation_Status_ID IN (3, 4)',
    });
  });

  // Was a bug: the ministry-year end (Aug 31 00:00) dropped every Aug 31 event.
  it('includes an event on the last day of the ministry year', async () => {
    const EVENTS = [
      { Event_ID: 1, Event_Start_Date: '2026-08-31T10:00:00', Event_End_Date: '2026-08-31T12:00:00' },
      { Event_ID: 2, Event_Start_Date: '2026-09-01T10:00:00', Event_End_Date: '2026-09-01T12:00:00' },
    ];
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') {
        return Promise.resolve(
          EVENTS.filter(e => matchesDatePredicates(p.filter, e))
            .map(({ Event_ID, Event_Start_Date }) => ({ Event_ID, Event_Start_Date })),
        );
      }
      if (p.table === 'Event_Participants') {
        return Promise.resolve(inList(p.filter).map(id => ({ Event_ID: Number(id), Participant_ID: 900 + Number(id) })));
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(
      priv(svc).getEventParticipantsByMonth(new Date(2025, 8, 1), new Date(2026, 7, 31)),
    ).resolves.toEqual([{ month: '2026-08', participantIds: [901] }]);
    expect(calls('Events')[0].filter).toBe(
      "Event_Start_Date >= '2025-09-01 00:00:00' AND Event_Start_Date < '2026-09-01 00:00:00' AND Cancelled = 0",
    );
  });

  it('returns [] without a participants query when there are no events', async () => {
    const svc = await newService();
    await expect(priv(svc).getEventParticipantsByMonth(START, END)).resolves.toEqual([]);
    expect(calls('Event_Participants')).toHaveLength(0);
  });

  it('buckets unique participants by event month, sorted by month', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') {
        return Promise.resolve([
          { Event_ID: 30, Event_Start_Date: '2025-11-02T10:00:00' },
          { Event_ID: 10, Event_Start_Date: '2025-09-07T10:00:00' },
          { Event_ID: 11, Event_Start_Date: '2025-09-30T10:00:00' },
        ]);
      }
      if (p.table === 'Event_Participants') {
        return Promise.resolve([
          { Event_ID: 30, Participant_ID: 7 },
          { Event_ID: 10, Participant_ID: 1 },
          { Event_ID: 10, Participant_ID: 2 },
          { Event_ID: 11, Participant_ID: 1 }, // same person, same month: once
          { Event_ID: 999, Participant_ID: 8 }, // not one of our events: skipped
        ]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(priv(svc).getEventParticipantsByMonth(START, END)).resolves.toEqual([
      { month: '2025-09', participantIds: [1, 2] },
      { month: '2025-11', participantIds: [7] },
    ]);
  });

  it('batches the participants read in groups of 100 event IDs', async () => {
    const events = Array.from({ length: 101 }, (_, i) => ({
      Event_ID: i + 1,
      Event_Start_Date: '2025-09-07T10:00:00',
    }));
    mockGetTableRecords.mockImplementation((p: Call) => Promise.resolve(p.table === 'Events' ? events : []));
    const svc = await newService();
    await priv(svc).getEventParticipantsByMonth(START, END);
    const eps = calls('Event_Participants');
    expect(eps).toHaveLength(2);
    expect(eps[1].filter).toBe('Event_ID IN (101) AND Participation_Status_ID IN (3, 4)');
  });

  // Was a bug (#304): the catch returned an empty value, which the 'use cache'
  // caller then cached over the previous good value for at least 6h. Rethrowing
  // lets both cache layers keep serving the last good data.
  it('rethrows an MP failure (logged) so the cache keeps its previous value', async () => {
    mockGetTableRecords.mockRejectedValue(new Error('MP down'));
    const svc = await newService();
    await expect(priv(svc).getEventParticipantsByMonth(START, END)).rejects.toThrow('MP down');
    expect(errorSpy).toHaveBeenCalledWith(
      'Error fetching event participants by month:',
      expect.stringContaining('MP down'),
    );
  });

  it('rejects when the second Event_Participants batch fails (no partial result)', async () => {
    const events = Array.from({ length: 101 }, (_, i) => ({ Event_ID: i + 1, Event_Start_Date: '2025-09-07T10:00:00' }));
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') return Promise.resolve(events);
      if (p.table === 'Event_Participants') {
        return Number(inList(p.filter)[0]) > 100
          ? Promise.reject(new Error('MP down'))
          : Promise.resolve([{ Event_ID: 1, Participant_ID: 7 }]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    await expect(priv(svc).getEventParticipantsByMonth(START, END)).rejects.toThrow('MP down');
    expect(calls('Event_Participants')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Wiring through the public methods
// ---------------------------------------------------------------------------
describe('public wiring', () => {
  type Stubbable = Record<string, (...args: unknown[]) => Promise<unknown>>;

  /** Stub the collaborators this file does not cover. */
  const stubUnrelated = (svc: DashboardService) => {
    const s = svc as unknown as Stubbable;
    vi.spyOn(s, 'getPeriodMetrics').mockResolvedValue({});
    vi.spyOn(s, 'getGroupTypeMetrics').mockResolvedValue([]);
    vi.spyOn(s, 'getRosterAndAttendanceRaw').mockResolvedValue({ rosterMemberRecords: [], attendanceByMonth: [] });
    vi.spyOn(s, 'getServingLeadingRaw').mockResolvedValue([]);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2025, 10, 15, 12));
  });

  it('getDashboardData maps milestones 3/48/51/52 to baptism/membership/associate/youth dates', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Participant_Milestones') {
        const id = /Milestone_ID = (\d+)/.exec(p.filter!)![1];
        return Promise.resolve([{ Date_Accomplished: `m${id}` }]);
      }
      return Promise.resolve([]);
    });
    const svc = await newService();
    stubUnrelated(svc);

    const data = await svc.getDashboardData(new Date(2025, 8, 1), new Date(2026, 7, 31));

    expect(data.baptismDates).toEqual(['m3']);
    expect(data.membershipDates).toEqual(['m48']);
    expect(data.associateMemberDates).toEqual(['m51']);
    expect(data.youthMemberDates).toEqual(['m52']);
  });

  it('getDashboardData requests the previous ministry year for previousYearMonthlyAttendanceTrends', async () => {
    const svc = await newService();
    stubUnrelated(svc);
    const data = await svc.getDashboardData(new Date(2025, 8, 1), new Date(2026, 7, 31));

    // Current year is capped at today (Sep-Nov); previous year is complete.
    expect(data.monthlyAttendanceTrends.map(t => t.month)).toEqual(['2025-09', '2025-10', '2025-11']);
    expect(data.previousYearMonthlyAttendanceTrends).toHaveLength(12);
    expect(data.previousYearMonthlyAttendanceTrends[0].month).toBe('2024-09');
    expect(data.previousYearMonthlyAttendanceTrends[11].month).toBe('2025-08');
    expect(data.communityAttendanceTrends).toEqual([]);
    expect(data.weeklyCommunityAttendanceTrends).toEqual([]);
  });

  // Was wasteful: the current and previous series were fetched separately, and for
  // the 5-year range they overlap in 48 months, so those months were queried twice
  // (about 96 extra MP calls, each one more way to fail the all-or-nothing section).
  it('getDashboardData queries each month of attendance once and splits it into both periods', async () => {
    const svc = await newService();
    stubUnrelated(svc);
    // Today is Nov 15 2025: the full range Sep 2021 .. Aug 2026, as loadFullRangeData builds it.
    const data = await svc.getDashboardData(new Date(2021, 8, 1), new Date(2026, 7, 31));

    const monthStarts = calls('Events')
      .filter((c) => /Event_Type_ID = 7$/.test(c.filter ?? ''))
      .map((c) => /Event_Start_Date >= '(\d{4}-\d{2})-01 /.exec(c.filter ?? '')![1]);
    // Sep 2020 (the previous period's start) .. Nov 2025 (capped at today): 63 months.
    expect(monthStarts).toHaveLength(63);
    expect(new Set(monthStarts).size).toBe(63);
    expect(monthStarts[0]).toBe('2020-09');
    expect(monthStarts.at(-1)).toBe('2025-11');

    const current = data.monthlyAttendanceTrends.map((t) => t.month);
    expect(current).toHaveLength(51);
    expect([current[0], current.at(-1)]).toEqual(['2021-09', '2025-11']);
    const previous = data.previousYearMonthlyAttendanceTrends.map((t) => t.month);
    expect(previous).toHaveLength(60);
    expect([previous[0], previous.at(-1)]).toEqual(['2020-09', '2025-08']);
  });

  it('getDashboardData rejects when all monthly attendance fails, rather than returning data to cache', async () => {
    mockGetTableRecords.mockImplementation((p: Call) =>
      p.table === 'Events' && /Event_Type_ID = 7$/.test(p.filter ?? '')
        ? Promise.reject(new Error('MP down'))
        : Promise.resolve([]),
    );
    const svc = await newService();
    stubUnrelated(svc);
    await expect(svc.getDashboardData(new Date(2025, 8, 1), new Date(2026, 7, 31))).rejects.toThrow(
      /monthly queries failed/,
    );
  });

  // #304: one DashboardData is one cache entry, so one failed section must
  // reject the whole result rather than resolve with an empty section.
  it('getDashboardData rejects when a single milestone read fails', async () => {
    mockGetTableRecords.mockImplementation((p: Call) =>
      p.table === 'Participant_Milestones' && /Milestone_ID = 51 /.test(p.filter ?? '')
        ? Promise.reject(new Error('MP down'))
        : Promise.resolve([]),
    );
    const svc = await newService();
    stubUnrelated(svc);
    await expect(svc.getDashboardData(new Date(2025, 8, 1), new Date(2026, 7, 31))).rejects.toThrow('MP down');
    expect(errorSpy).toHaveBeenCalledWith(
      'Error fetching milestone dates for Milestone_ID=51:',
      expect.stringContaining('MP down'),
    );
  });

  it('getExtendedDashboardData rejects when the event participants read fails', async () => {
    mockGetTableRecords.mockImplementation((p: Call) =>
      p.table === 'Events' ? Promise.reject(new Error('MP down')) : Promise.resolve([]),
    );
    const svc = await newService();
    stubUnrelated(svc);
    await expect(svc.getExtendedDashboardData(new Date(2025, 8, 1), new Date(2025, 10, 30))).rejects.toThrow('MP down');
  });

  it('getExtendedDashboardData returns getEventParticipantsByMonth output', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Events') return Promise.resolve([{ Event_ID: 5, Event_Start_Date: '2025-10-05T10:00:00' }]);
      if (p.table === 'Event_Participants') return Promise.resolve([{ Event_ID: 5, Participant_ID: 42 }]);
      return Promise.resolve([]);
    });
    const svc = await newService();
    stubUnrelated(svc);
    const data = await svc.getExtendedDashboardData(new Date(2025, 8, 1), new Date(2025, 10, 30));
    expect(data.eventParticipantsByMonth).toEqual([{ month: '2025-10', participantIds: [42] }]);
  });
});
