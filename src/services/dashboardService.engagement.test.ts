/**
 * DashboardService: extended + engagement data (#302).
 *
 * Covers getExtendedDashboardData / getEngagementDashboardData and the private
 * methods behind them: getRosterAndAttendanceRaw, getServingLeadingRaw,
 * getEngagementRawData, getServingContactIds and filterAdultContacts.
 *
 * The private methods are reached through a cast (`internals(service)`): they are
 * the units with the logic, and their public callers only fan them out through
 * Promise.all, so testing them directly keeps each case to the tables it needs.
 *
 * MP is a single mocked getTableRecords that routes by table (and, where a table
 * is read two ways, by filter shape). Nothing reaches the network.
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

// The service cache is a pass-through here so every test sees a fresh fetch
// (getCachedGroupTypes wraps its Group_Types read in serviceCache.getOrFetch).
vi.mock('@/lib/service-cache', () => ({
  serviceCache: {
    getOrFetch: (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
  },
  CACHE_TTL: { STANDARD: 21_600_000, LONG: 86_400_000 },
}));

import { DashboardService } from '@/services/dashboardService';
import type {
  EngagementRawData,
  RosterMemberRecord,
  AttendanceMonthRecord,
  ServingLeadingRecord,
} from '@/lib/dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QueryParams = {
  table: string;
  select: string;
  filter?: string;
  distinct?: boolean;
  groupBy?: string;
};
type Handler = (p: QueryParams) => unknown[] | Promise<unknown[]>;

interface Internals {
  getRosterAndAttendanceRaw(start: Date, end: Date): Promise<{
    rosterMemberRecords: RosterMemberRecord[];
    attendanceByMonth: AttendanceMonthRecord[];
  }>;
  getServingLeadingRaw(start: Date, end: Date): Promise<ServingLeadingRecord[]>;
  getEngagementRawData(start: Date, end: Date): Promise<EngagementRawData>;
  getServingContactIds(startIso: string, endIso: string): Promise<Set<number>>;
  filterAdultContacts(ids: Set<number>): Promise<Set<number>>;
}

// Private methods: reached through a cast on purpose (see the file header).
const internals = (s: DashboardService) => s as unknown as Internals;

/** Route every getTableRecords call to a per-table handler; unknown tables return []. */
function route(handlers: Record<string, Handler>) {
  mockGetTableRecords.mockImplementation(async (p: QueryParams) => {
    const h = handlers[p.table];
    return h ? h(p) : [];
  });
}

/** IDs inside `<column> IN (...)` of a filter, as numbers. */
function idsIn(filter: string | undefined, column: string): number[] {
  const m = (filter ?? '').match(new RegExp(`(?:^|[^_])${column} IN \\(([^)]*)\\)`));
  return m ? m[1].split(',').map(Number) : [];
}

function callsFor(table: string): QueryParams[] {
  return mockGetTableRecords.mock.calls
    .map((c) => c[0] as QueryParams)
    .filter((p) => p.table === table);
}

/** Participants lookup: Participant_ID n -> Contact_ID 1000 + n, except `unmapped`. */
function participantsHandler(unmapped: number[] = []): Handler {
  return (p) =>
    idsIn(p.filter, 'Participant_ID')
      .filter((id) => !unmapped.includes(id))
      .map((id) => ({ Participant_ID: id, Contact_ID: 1000 + id }));
}

const START = new Date(2025, 8, 1); // Sept 1, local
const END = new Date(2026, 7, 31); // Aug 31, local
const START_ISO = START.toISOString();
const END_ISO = END.toISOString();
const ACTIVE_RANGE = `Start_Date <= '${END_ISO}' AND (End_Date IS NULL OR End_Date >= '${START_ISO}')`;

let service: DashboardService;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  mockGetTableRecords.mockReset();
  mockGetTableRecords.mockResolvedValue([]);
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  service = await DashboardService.getInstance();
});

afterEach(() => {
  errorSpy.mockRestore();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// getRosterAndAttendanceRaw
// ---------------------------------------------------------------------------

describe('getRosterAndAttendanceRaw', () => {
  function rosterFixture(overrides: Partial<Record<string, Handler>> = {}) {
    route({
      Groups: () => [
        { Group_ID: 1, Group_Type_ID: 1 },
        { Group_ID: 5, Group_Type_ID: 1 },
        { Group_ID: 2, Group_Type_ID: 3 },
        { Group_ID: 3, Group_Type_ID: 11 },
        { Group_ID: 4, Group_Type_ID: 99 }, // not in Group_Types -> 'Unknown'
      ],
      Group_Types: () => [
        { Group_Type_ID: 1, Group_Type: 'Small Group' },
        { Group_Type_ID: 3, Group_Type: 'Class' },
        { Group_Type_ID: 11, Group_Type: 'Community' },
      ],
      Group_Participants: () => [
        { Group_ID: 1, Participant_ID: 10, Start_Date: '2025-09-05T00:00:00', End_Date: '2025-12-01T00:00:00' },
        // Later start in another type-1 group, still active -> the merged record goes active
        { Group_ID: 5, Participant_ID: 10, Start_Date: '2026-01-10T00:00:00', End_Date: null },
        { Group_ID: 2, Participant_ID: 11, Start_Date: '2025-09-01T00:00:00', End_Date: null },
        { Group_ID: 1, Participant_ID: 12, Start_Date: '2025-09-01T00:00:00', End_Date: null }, // no contact
        { Group_ID: 4, Participant_ID: 13, Start_Date: '2025-10-01T00:00:00', End_Date: null },
        { Group_ID: 999, Participant_ID: 14, Start_Date: '2025-10-01T00:00:00', End_Date: null }, // unknown group
      ],
      Event_Participants: () => [
        { Event_ID: 100, Group_ID: 1, Participant_ID: 10 },
        { Event_ID: 100, Group_ID: 1, Participant_ID: 10 }, // duplicate row
        { Event_ID: 101, Group_ID: 5, Participant_ID: 10 }, // same month + type -> same bucket
        { Event_ID: 102, Group_ID: 2, Participant_ID: 11 },
        { Event_ID: 103, Group_ID: 1, Participant_ID: 11 },
        { Event_ID: 104, Group_ID: 1, Participant_ID: 10 }, // event has no date -> skipped
        { Event_ID: 100, Group_ID: 1, Participant_ID: 12 }, // no contact -> skipped
        { Event_ID: 102, Group_ID: 999, Participant_ID: 14 }, // group not in Groups -> skipped
      ],
      Events: () => [
        { Event_ID: 100, Event_Start_Date: '2025-09-14T10:00:00' },
        { Event_ID: 101, Event_Start_Date: '2025-09-21T10:00:00' },
        { Event_ID: 102, Event_Start_Date: '2025-10-05T09:00:00' },
        { Event_ID: 103, Event_Start_Date: '2026-01-11T09:00:00' },
      ],
      Participants: participantsHandler([12]),
      ...overrides,
    } as Record<string, Handler>);
  }

  it('reads Small Group, Class and Community groups active in the range', async () => {
    rosterFixture();
    await internals(service).getRosterAndAttendanceRaw(START, END);

    expect(callsFor('Groups')).toEqual([{
      table: 'Groups',
      select: 'Group_ID,Group_Type_ID',
      filter: `Group_Type_ID IN (1, 3, 11) AND ${ACTIVE_RANGE}`,
    }]);
  });

  it('builds deduplicated roster records and month/type attendance buckets', async () => {
    rosterFixture();
    const result = await internals(service).getRosterAndAttendanceRaw(START, END);

    expect(result.rosterMemberRecords).toEqual([
      // earliest start kept, and the active later row clears the end date
      { contactId: 1010, groupTypeId: 1, groupTypeName: 'Small Group', startDate: '2025-09-05T00:00:00', endDate: null },
      { contactId: 1011, groupTypeId: 3, groupTypeName: 'Class', startDate: '2025-09-01T00:00:00', endDate: null },
      { contactId: 1013, groupTypeId: 99, groupTypeName: 'Unknown', startDate: '2025-10-01T00:00:00', endDate: null },
    ]);

    expect(result.attendanceByMonth).toEqual([
      { month: '2025-09', groupTypeId: 1, groupTypeName: 'Small Group', contactIds: [1010] },
      { month: '2025-10', groupTypeId: 3, groupTypeName: 'Class', contactIds: [1011] },
      { month: '2026-01', groupTypeId: 1, groupTypeName: 'Small Group', contactIds: [1011] },
    ]);
  });

  it('queries child tables by sanitized, batched ID lists with the right extra filters', async () => {
    rosterFixture();
    await internals(service).getRosterAndAttendanceRaw(START, END);

    // Group_Types goes through the cached lookup, once, for every type seen. The
    // ID order only feeds a cache key, so compare the set, not the string.
    const groupTypeCalls = callsFor('Group_Types');
    expect(groupTypeCalls).toEqual([{
      table: 'Group_Types',
      select: 'Group_Type_ID,Group_Type',
      filter: expect.stringMatching(/^Group_Type_ID IN \([\d,]+\)$/),
    }]);
    expect(idsIn(groupTypeCalls[0].filter, 'Group_Type_ID').sort((a, b) => a - b)).toEqual([1, 3, 11, 99]);

    expect(callsFor('Group_Participants')).toEqual([{
      table: 'Group_Participants',
      select: 'Group_ID,Participant_ID,Start_Date,End_Date',
      filter: 'Group_ID IN (1,5,2,3,4)', // roster: no date filter, the client filters
    }]);
    expect(callsFor('Event_Participants')).toEqual([{
      table: 'Event_Participants',
      select: 'Event_ID,Group_ID,Participant_ID',
      filter: 'Group_ID IN (1,5,2,3,4) AND Participation_Status_ID IN (3, 4)',
    }]);
    expect(callsFor('Events')).toEqual([{
      table: 'Events',
      select: 'Event_ID,Event_Start_Date',
      filter: 'Event_ID IN (100,101,102,103,104)', // unique event IDs
    }]);
    // Participants from both roster and attendance, once each
    expect(idsIn(callsFor('Participants')[0].filter, 'Participant_ID').sort((a, b) => a - b))
      .toEqual([10, 11, 12, 13, 14]);
  });

  it('drops IDs that sanitizeIds rejects instead of interpolating them', async () => {
    rosterFixture({
      Groups: () => [
        { Group_ID: 1, Group_Type_ID: 1 },
        { Group_ID: '1) OR (1=1', Group_Type_ID: 1 },
        { Group_ID: 0, Group_Type_ID: 1 },
        { Group_ID: -7, Group_Type_ID: 1 },
      ],
    });
    await internals(service).getRosterAndAttendanceRaw(START, END);

    const gp = callsFor('Group_Participants')[0];
    expect(gp.filter).toBe('Group_ID IN (1)');
    expect(gp.filter).not.toContain('OR');
  });

  // BUG (reported): same cached-empty catch as below. A batch whose IDs are all
  // rejected makes sanitizeIds throw, and the catch turns that into empty data
  // for the whole roster rather than just skipping the bad batch.
  it('returns empty data when every ID in a batch is rejected (current behaviour)', async () => {
    rosterFixture({ Groups: () => [{ Group_ID: 0, Group_Type_ID: 1 }, { Group_ID: -7, Group_Type_ID: 1 }] });
    await expect(internals(service).getRosterAndAttendanceRaw(START, END))
      .resolves.toEqual({ rosterMemberRecords: [], attendanceByMonth: [] });
    expect(callsFor('Group_Participants')).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalledWith('Error fetching roster and attendance raw data:', expect.any(Error));
  });

  it('chunks a large group list into batches of 100', async () => {
    const groups = Array.from({ length: 250 }, (_, i) => ({ Group_ID: i + 1, Group_Type_ID: 1 }));
    rosterFixture({ Groups: () => groups, Event_Participants: () => [], Group_Participants: () => [] });
    await internals(service).getRosterAndAttendanceRaw(START, END);

    const batches = callsFor('Group_Participants').map((p) => idsIn(p.filter, 'Group_ID'));
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(groups.map((g) => g.Group_ID));

    const epBatches = callsFor('Event_Participants');
    expect(epBatches).toHaveLength(3);
    for (const p of epBatches) expect(p.filter).toMatch(/\) AND Participation_Status_ID IN \(3, 4\)$/);
  });

  it('stops after the Groups read when there are no relevant groups', async () => {
    route({ Groups: () => [] });
    await expect(internals(service).getRosterAndAttendanceRaw(START, END))
      .resolves.toEqual({ rosterMemberRecords: [], attendanceByMonth: [] });
    expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    // The early return, not the catch: going on would look up group types for
    // an empty set, which sanitizeIds rejects, and the catch would log it.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('skips the Events lookup when there is no attendance', async () => {
    rosterFixture({ Event_Participants: () => [] });
    const result = await internals(service).getRosterAndAttendanceRaw(START, END);
    expect(callsFor('Events')).toHaveLength(0);
    expect(result.attendanceByMonth).toEqual([]);
    expect(result.rosterMemberRecords).toHaveLength(3);
  });

  // BUG (reported): the catch returns empty data, and this runs inside the
  // 'use cache' getCachedExtendedData, so one MP failure caches an empty roster
  // over the previous good value (.claude/rules/caching.md, "Never silently
  // return empty data in cached code paths"). This pins the current behaviour.
  it('returns empty data and logs when an MP read fails (current behaviour)', async () => {
    rosterFixture({ Event_Participants: () => Promise.reject(new Error('ConnectTimeoutError')) });
    await expect(internals(service).getRosterAndAttendanceRaw(START, END))
      .resolves.toEqual({ rosterMemberRecords: [], attendanceByMonth: [] });
    expect(errorSpy).toHaveBeenCalledWith('Error fetching roster and attendance raw data:', expect.any(Error));
  });

  // BUG (reported): the merge is order-dependent. When an ended row with an
  // EARLIER start arrives after an active row, it replaces the whole record,
  // end date included, so a currently active member is reported as having
  // left. In the opposite order the same rows give endDate: null.
  it('loses an active membership when an earlier ended row comes second (current behaviour)', async () => {
    const active = { Group_ID: 5, Participant_ID: 10, Start_Date: '2026-01-10T00:00:00', End_Date: null };
    const ended = { Group_ID: 1, Participant_ID: 10, Start_Date: '2025-09-05T00:00:00', End_Date: '2025-12-01T00:00:00' };

    rosterFixture({ Group_Participants: () => [active, ended], Event_Participants: () => [] });
    const activeFirst = await internals(service).getRosterAndAttendanceRaw(START, END);

    rosterFixture({ Group_Participants: () => [ended, active], Event_Participants: () => [] });
    const endedFirst = await internals(service).getRosterAndAttendanceRaw(START, END);

    expect(endedFirst.rosterMemberRecords[0].endDate).toBeNull();
    expect(activeFirst.rosterMemberRecords[0].endDate).toBe('2025-12-01T00:00:00'); // should be null
  });
});

// ---------------------------------------------------------------------------
// getServingLeadingRaw
// ---------------------------------------------------------------------------

describe('getServingLeadingRaw', () => {
  function servingFixture(overrides: Partial<Record<string, Handler>> = {}) {
    route({
      Group_Roles: () => [
        { Group_Role_ID: 1, Group_Role_Type_ID: 1, Ministry_ID: 50 },
        { Group_Role_ID: 2, Group_Role_Type_ID: 3, Ministry_ID: 60 },
        { Group_Role_ID: 3, Group_Role_Type_ID: 3, Ministry_ID: null },
        { Group_Role_ID: 4, Group_Role_Type_ID: 3, Ministry_ID: 70 }, // not in Ministries
        { Group_Role_ID: 5, Group_Role_Type_ID: 3, Ministry_ID: 60 }, // second role, same ministry
      ],
      Group_Participants: () => [
        { Participant_ID: 20, Group_Role_ID: 1, Start_Date: '2025-09-01T00:00:00', End_Date: null },
        { Participant_ID: 20, Group_Role_ID: 1, Start_Date: '2025-10-01T00:00:00', End_Date: '2025-12-01T00:00:00' },
        { Participant_ID: 21, Group_Role_ID: 2, Start_Date: '2025-11-01T00:00:00', End_Date: '2026-02-01T00:00:00' },
        { Participant_ID: 21, Group_Role_ID: 5, Start_Date: '2025-10-15T00:00:00', End_Date: '2026-01-01T00:00:00' },
        { Participant_ID: 21, Group_Role_ID: 3, Start_Date: '2025-11-01T00:00:00', End_Date: null },
        { Participant_ID: 22, Group_Role_ID: 4, Start_Date: '2026-01-01T00:00:00', End_Date: null },
        { Participant_ID: 23, Group_Role_ID: 2, Start_Date: '2026-01-01T00:00:00', End_Date: null }, // no contact
      ],
      Participants: participantsHandler([23]),
      // Only the Leader type has an MP name here; Servant falls back
      Group_Role_Types: () => [{ Group_Role_Type_ID: 1, Group_Role_Type: 'Group Leader' }],
      Ministries: () => [
        { Ministry_ID: 50, Ministry_Name: 'Music' },
        { Ministry_ID: 60, Ministry_Name: 'Children' },
      ],
      ...overrides,
    } as Record<string, Handler>);
  }

  it('reads serving/leading roles, then participants active in the range', async () => {
    servingFixture();
    await internals(service).getServingLeadingRaw(START, END);

    expect(callsFor('Group_Roles')).toEqual([{
      table: 'Group_Roles',
      select: 'Group_Role_ID,Group_Role_Type_ID,Ministry_ID',
      filter: 'Group_Role_Type_ID IN (1, 3)',
    }]);
    expect(callsFor('Group_Participants')).toEqual([{
      table: 'Group_Participants',
      select: 'Participant_ID,Group_Role_ID,Start_Date,End_Date',
      filter: `Group_Role_ID IN (1,2,3,4,5) AND ${ACTIVE_RANGE}`,
    }]);
    expect(callsFor('Participants')[0].filter).toBe('Participant_ID IN (20,21,22,23)');
    expect(callsFor('Group_Role_Types')[0].filter).toBe('Group_Role_Type_ID IN (1, 3)');
    // Unique, non-null ministry IDs only
    expect(callsFor('Ministries')).toEqual([{
      table: 'Ministries',
      select: 'Ministry_ID,Ministry_Name',
      filter: 'Ministry_ID IN (50,60,70)',
    }]);
  });

  it('enriches and deduplicates per contact, role type and ministry', async () => {
    servingFixture();
    const records = await internals(service).getServingLeadingRaw(START, END);

    expect(records).toEqual([
      // two rows on role 1: earliest start kept, and it is the active one
      {
        contactId: 1020, roleTypeId: 1, roleTypeName: 'Group Leader',
        ministryId: 50, ministryName: 'Music',
        startDate: '2025-09-01T00:00:00', endDate: null,
      },
      // roles 2 and 5 share ministry 60: one record, earliest start
      {
        contactId: 1021, roleTypeId: 3, roleTypeName: 'Servant',
        ministryId: 60, ministryName: 'Children',
        startDate: '2025-10-15T00:00:00', endDate: '2026-01-01T00:00:00',
      },
      {
        contactId: 1021, roleTypeId: 3, roleTypeName: 'Servant',
        ministryId: null, ministryName: null,
        startDate: '2025-11-01T00:00:00', endDate: null,
      },
      {
        contactId: 1022, roleTypeId: 3, roleTypeName: 'Servant',
        ministryId: 70, ministryName: 'Unknown',
        startDate: '2026-01-01T00:00:00', endDate: null,
      },
    ]);
  });

  it("falls back to 'Leader' when MP has no name for role type 1", async () => {
    servingFixture({ Group_Role_Types: () => [] });
    const records = await internals(service).getServingLeadingRaw(START, END);
    expect(records.find((r) => r.roleTypeId === 1)?.roleTypeName).toBe('Leader');
  });

  it('skips the Ministries read when no role has a ministry', async () => {
    servingFixture({
      Group_Roles: () => [{ Group_Role_ID: 3, Group_Role_Type_ID: 3, Ministry_ID: null }],
      Group_Participants: () => [
        { Participant_ID: 21, Group_Role_ID: 3, Start_Date: '2025-11-01T00:00:00', End_Date: null },
      ],
    });
    const records = await internals(service).getServingLeadingRaw(START, END);
    expect(callsFor('Ministries')).toHaveLength(0);
    expect(records).toEqual([expect.objectContaining({ contactId: 1021, ministryId: null, ministryName: null })]);
  });

  it('returns [] after one read when there are no serving roles', async () => {
    route({ Group_Roles: () => [] });
    await expect(internals(service).getServingLeadingRaw(START, END)).resolves.toEqual([]);
    expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns [] without resolving contacts when no participant holds a role', async () => {
    servingFixture({ Group_Participants: () => [] });
    await expect(internals(service).getServingLeadingRaw(START, END)).resolves.toEqual([]);
    expect(callsFor('Participants')).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('chunks role IDs into batches of 100, each with the date filter', async () => {
    const roles = Array.from({ length: 201 }, (_, i) => ({
      Group_Role_ID: i + 1, Group_Role_Type_ID: 3, Ministry_ID: null,
    }));
    servingFixture({ Group_Roles: () => roles, Group_Participants: () => [] });
    await internals(service).getServingLeadingRaw(START, END);

    const calls = callsFor('Group_Participants');
    expect(calls.map((p) => idsIn(p.filter, 'Group_Role_ID').length)).toEqual([100, 100, 1]);
    for (const p of calls) expect(p.filter).toContain(`) AND ${ACTIVE_RANGE}`);
  });

  // BUG (reported): same order-dependent merge as the roster. A later active row
  // reopens an earlier ended one, but an earlier ended row arriving second
  // overwrites an active one, so a current servant reads as having stopped.
  it('merges end dates differently depending on row order (current behaviour)', async () => {
    const ended = { Participant_ID: 21, Group_Role_ID: 2, Start_Date: '2025-09-01T00:00:00', End_Date: '2025-12-01T00:00:00' };
    const active = { Participant_ID: 21, Group_Role_ID: 2, Start_Date: '2026-01-05T00:00:00', End_Date: null };

    servingFixture({ Group_Participants: () => [ended, active] });
    const endedFirst = await internals(service).getServingLeadingRaw(START, END);

    servingFixture({ Group_Participants: () => [active, ended] });
    const activeFirst = await internals(service).getServingLeadingRaw(START, END);

    expect(endedFirst).toEqual([expect.objectContaining({ startDate: '2025-09-01T00:00:00', endDate: null })]);
    expect(activeFirst).toEqual([
      expect.objectContaining({ startDate: '2025-09-01T00:00:00', endDate: '2025-12-01T00:00:00' }), // should be null
    ]);
  });

  // BUG (reported): same cached-empty problem as the roster (runs inside
  // getCachedExtendedData). Pins the current behaviour.
  it('returns [] and logs when an MP read fails (current behaviour)', async () => {
    servingFixture({ Participants: () => Promise.reject(new Error('boom')) });
    await expect(internals(service).getServingLeadingRaw(START, END)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Error fetching serving/leading raw records:', expect.any(Error));
  });
});

// ---------------------------------------------------------------------------
// getServingContactIds
// ---------------------------------------------------------------------------

describe('getServingContactIds', () => {
  it('resolves serving/leading participants active in the range to contact IDs', async () => {
    route({
      Group_Roles: () => [{ Group_Role_ID: 7 }, { Group_Role_ID: 8 }],
      Group_Participants: () => [{ Participant_ID: 30 }, { Participant_ID: 30 }, { Participant_ID: 31 }],
      Participants: participantsHandler(),
    });
    const ids = await internals(service).getServingContactIds(START_ISO, END_ISO);

    expect([...ids]).toEqual([1030, 1031]);
    expect(callsFor('Group_Roles')).toEqual([{
      table: 'Group_Roles', select: 'Group_Role_ID', filter: 'Group_Role_Type_ID IN (1, 3)',
    }]);
    expect(callsFor('Group_Participants')).toEqual([{
      table: 'Group_Participants',
      select: 'Participant_ID',
      filter: `Group_Role_ID IN (7,8) AND ${ACTIVE_RANGE}`,
    }]);
    expect(callsFor('Participants')[0].filter).toBe('Participant_ID IN (30,31)'); // deduplicated
  });

  it('returns an empty set early when there are no roles or no participants', async () => {
    route({ Group_Roles: () => [] });
    expect((await internals(service).getServingContactIds(START_ISO, END_ISO)).size).toBe(0);
    expect(mockGetTableRecords).toHaveBeenCalledTimes(1);

    mockGetTableRecords.mockClear();
    route({ Group_Roles: () => [{ Group_Role_ID: 7 }], Group_Participants: () => [] });
    expect((await internals(service).getServingContactIds(START_ISO, END_ISO)).size).toBe(0);
    expect(callsFor('Participants')).toHaveLength(0);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('swallows an MP failure and returns an empty set', async () => {
    route({ Group_Roles: () => Promise.reject(new Error('boom')) });
    const ids = await internals(service).getServingContactIds(START_ISO, END_ISO);
    expect(ids.size).toBe(0);
    expect(errorSpy).toHaveBeenCalledWith('Error fetching serving contact IDs:', expect.any(Error));
  });
});

// ---------------------------------------------------------------------------
// filterAdultContacts
// ---------------------------------------------------------------------------

describe('filterAdultContacts', () => {
  function withBirthdates(dobs: Record<number, string | null>) {
    route({
      Contacts: (p) =>
        idsIn(p.filter, 'Contact_ID')
          .filter((id) => id in dobs)
          .map((id) => ({ Contact_ID: id, Date_of_Birth: dobs[id] })),
    });
  }

  it('makes no MP call for an empty set', async () => {
    const result = await internals(service).filterAdultContacts(new Set());
    expect(result.size).toBe(0);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it('counts 18 from the birthday itself, and treats an unknown birthdate as adult', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 17, 10, 0, 0)); // Nov 17 2026, 10:00 local

    withBirthdates({
      1: '2008-11-17T00:00:00', // 18th birthday today -> adult
      2: '2008-11-18T00:00:00', // 18 tomorrow -> not yet
      3: '2008-11-16T00:00:00', // 18 yesterday -> adult
      4: '2009-01-01T00:00:00', // 17 -> excluded
      5: null, // unknown -> adult
      6: '1950-06-30T00:00:00',
      7: '2008-12-17T00:00:00', // birthday month not reached -> 17
    });
    const result = await internals(service).filterAdultContacts(new Set([1, 2, 3, 4, 5, 6, 7, 8]));

    // 8 is not returned by Contacts at all -> excluded, not assumed adult
    expect([...result].sort((a, b) => a - b)).toEqual([1, 3, 5, 6]);
    expect(callsFor('Contacts')).toEqual([{
      table: 'Contacts',
      select: 'Contact_ID,Date_of_Birth',
      filter: 'Contact_ID IN (1,2,3,4,5,6,7,8)',
    }]);
  });

  it('is an adult from the first instant of the 18th birthday', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    withBirthdates({ 1: '2008-11-17T00:00:00' });

    vi.setSystemTime(new Date(2026, 10, 16, 23, 59, 59, 999));
    expect((await internals(service).filterAdultContacts(new Set([1]))).has(1)).toBe(false);

    vi.setSystemTime(new Date(2026, 10, 17, 0, 0, 0, 0));
    expect((await internals(service).filterAdultContacts(new Set([1]))).has(1)).toBe(true);
  });

  it('treats a Feb 29 birthday as reached on Mar 1 in a non-leap year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    withBirthdates({ 1: '2008-02-29T00:00:00' });

    vi.setSystemTime(new Date(2026, 1, 28, 12));
    expect((await internals(service).filterAdultContacts(new Set([1]))).has(1)).toBe(false);

    vi.setSystemTime(new Date(2026, 2, 1, 0, 0, 1));
    expect((await internals(service).filterAdultContacts(new Set([1]))).has(1)).toBe(true);
  });

  it('chunks a large contact set into batches of 100', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 17, 10));
    const ids = Array.from({ length: 150 }, (_, i) => i + 1);
    withBirthdates(Object.fromEntries(ids.map((id) => [id, null])));

    const result = await internals(service).filterAdultContacts(new Set(ids));
    expect(result.size).toBe(150);
    expect(callsFor('Contacts').map((p) => idsIn(p.filter, 'Contact_ID').length)).toEqual([100, 50]);
  });

  it('propagates an MP failure (no catch of its own)', async () => {
    route({ Contacts: () => Promise.reject(new Error('boom')) });
    await expect(internals(service).filterAdultContacts(new Set([1]))).rejects.toThrow('boom');
  });
});

// ---------------------------------------------------------------------------
// getEngagementRawData
// ---------------------------------------------------------------------------

describe('getEngagementRawData', () => {
  const RANGE_START = new Date(2026, 0, 1);
  const RANGE_END = new Date(2026, 7, 31);
  const NOW = new Date(2026, 2, 15, 12, 0, 0); // Mar 15 2026, noon local

  const jan = { start: new Date(2026, 0, 1), end: new Date(2026, 0, 31, 23, 59, 59) };
  const feb = { start: new Date(2026, 1, 1), end: new Date(2026, 1, 28, 23, 59, 59) };
  const mar = { start: new Date(2026, 2, 1), end: NOW };

  const activityFilter = (m: { start: Date; end: Date }) =>
    `Activity_Date >= '${m.start.toISOString()}' AND Activity_Date <= '${m.end.toISOString()}' AND Page_ID <> 316`;

  const DOBS: Record<number, string | null> = {
    1001: null,
    1002: '2015-05-05T00:00:00', // child
    1003: '1980-01-01T00:00:00',
    1004: '1990-01-01T00:00:00',
    1005: '1975-03-03T00:00:00', // serving only
    // 1009: no Contacts row
  };

  function engagementFixture(overrides: Partial<Record<string, Handler>> = {}) {
    route({
      Activity_Log: (p) => {
        if (p.filter === activityFilter(jan)) return [{ Contact_ID: 1001 }, { Contact_ID: 1002 }, { Contact_ID: 1003 }];
        if (p.filter === activityFilter(feb)) return [];
        if (p.filter === activityFilter(mar)) return [{ Contact_ID: 1001 }, { Contact_ID: 1009 }];
        throw new Error(`unexpected Activity_Log filter: ${p.filter}`);
      },
      Groups: () => [{ Group_ID: 40 }, { Group_ID: 41 }],
      Group_Participants: (p) => {
        if (p.filter?.includes('Group_Role_ID IN')) return [{ Participant_ID: 5 }];
        return [
          { Participant_ID: 1, Start_Date: '2025-06-01T00:00:00', End_Date: '2025-12-31T00:00:00' },
          { Participant_ID: 1, Start_Date: '2025-09-01T00:00:00', End_Date: null }, // later + active
          { Participant_ID: 2, Start_Date: '2025-09-01T00:00:00', End_Date: null }, // child
          { Participant_ID: 4, Start_Date: '2025-09-01T00:00:00', End_Date: null },
          { Participant_ID: 6, Start_Date: '2025-09-01T00:00:00', End_Date: null }, // no contact
        ];
      },
      Group_Roles: () => [{ Group_Role_ID: 9 }],
      Participants: participantsHandler([6]),
      Contacts: (p) =>
        idsIn(p.filter, 'Contact_ID')
          .filter((id) => id in DOBS)
          .map((id) => ({ Contact_ID: id, Date_of_Birth: DOBS[id] })),
      ...overrides,
    } as Record<string, Handler>);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  it('queries Activity_Log once per month up to today, distinct by contact, excluding Page 316', async () => {
    engagementFixture();
    await internals(service).getEngagementRawData(RANGE_START, RANGE_END);

    // Apr..Aug are in the future and never queried
    expect(callsFor('Activity_Log')).toEqual([jan, feb, mar].map((m) => ({
      table: 'Activity_Log',
      select: 'Contact_ID',
      filter: activityFilter(m),
      distinct: true,
      groupBy: 'Contact_ID',
    })));
  });

  it('reads engagement groups and their participants active in the range', async () => {
    engagementFixture();
    await internals(service).getEngagementRawData(RANGE_START, RANGE_END);

    const s = RANGE_START.toISOString();
    const e = RANGE_END.toISOString();
    const range = `Start_Date <= '${e}' AND (End_Date IS NULL OR End_Date >= '${s}')`;

    expect(callsFor('Groups')).toEqual([{
      table: 'Groups',
      select: 'Group_ID',
      filter: `(Ministry_ID IN (8, 14, 19) OR Group_ID = 763) AND ${range}`,
    }]);
    const gp = callsFor('Group_Participants');
    expect(gp).toContainEqual({
      table: 'Group_Participants',
      select: 'Participant_ID,Start_Date,End_Date',
      filter: `Group_ID IN (40,41) AND ${range}`,
    });
    // getServingContactIds uses the same range
    expect(gp).toContainEqual({
      table: 'Group_Participants',
      select: 'Participant_ID',
      filter: `Group_Role_ID IN (9) AND ${range}`,
    });
  });

  it('keeps adults only, drops empty months, and folds serving contacts into the adult set', async () => {
    engagementFixture();
    const result = await internals(service).getEngagementRawData(RANGE_START, RANGE_END);

    expect(result.activityByMonth).toEqual([
      { month: '2026-01', contactIds: [1001, 1003] }, // 1002 is a child
      { month: '2026-03', contactIds: [1001] }, // 1009 has no Contacts row
    ]);
    expect(result.groupRecords).toEqual([
      // earliest start kept; the later active row clears the end date
      { contactId: 1001, startDate: '2025-06-01T00:00:00', endDate: null },
      { contactId: 1004, startDate: '2025-09-01T00:00:00', endDate: null },
    ]);
    // 1005 is only a server: it must still be in the adult set for the venn's serving circle
    expect([...result.adultContactIds].sort((a, b) => a - b)).toEqual([1001, 1003, 1004, 1005]);

    // One adult check covering every dimension's contacts
    const contactCalls = callsFor('Contacts');
    expect(contactCalls).toHaveLength(1);
    expect(idsIn(contactCalls[0].filter, 'Contact_ID').sort((a, b) => a - b))
      .toEqual([1001, 1002, 1003, 1004, 1005, 1009]);
  });

  it('skips group participant reads when no engagement group is active', async () => {
    engagementFixture({ Groups: () => [] });
    const result = await internals(service).getEngagementRawData(RANGE_START, RANGE_END);
    expect(result.groupRecords).toEqual([]);
    expect(callsFor('Group_Participants').every((p) => p.filter?.includes('Group_Role_ID IN'))).toBe(true);
  });

  it('runs to the end date when the range is already over', async () => {
    vi.setSystemTime(new Date(2026, 10, 17, 10));
    engagementFixture({ Activity_Log: () => [] });
    await internals(service).getEngagementRawData(new Date(2026, 0, 1), new Date(2026, 1, 28, 23, 59, 59));

    const filters = callsFor('Activity_Log').map((p) => p.filter);
    expect(filters).toEqual([activityFilter(jan), activityFilter(feb)]);
  });

  // BUG (reported, minor): the last month is capped at endDate itself, and the
  // cached callers build endDate as local midnight (new Date(y, m, d)), so
  // activity on the final day of a finished range is dropped.
  it('cuts the final day when the end date is midnight (current behaviour)', async () => {
    vi.setSystemTime(new Date(2026, 10, 17, 10));
    engagementFixture({ Activity_Log: () => [] });
    const endMidnight = new Date(2026, 1, 28);
    await internals(service).getEngagementRawData(new Date(2026, 1, 1), endMidnight);

    expect(callsFor('Activity_Log').map((p) => p.filter)).toEqual([
      activityFilter({ start: new Date(2026, 1, 1), end: endMidnight }),
    ]);
  });

  it('starts the first month on the 1st even when the range starts mid-month', async () => {
    engagementFixture({ Activity_Log: () => [] });
    await internals(service).getEngagementRawData(new Date(2026, 1, 15), RANGE_END);
    expect(callsFor('Activity_Log')[0].filter).toBe(activityFilter(feb));
  });

  // BUG (reported): Promise.all over the months, not allSettled. One failed month
  // throws away every month, groups and the adult set, and the catch returns
  // empty data inside the 'use cache' getCachedEngagementData, caching it.
  it('returns all-empty data when a single month fails (current behaviour)', async () => {
    engagementFixture({
      Activity_Log: (p) => (p.filter === activityFilter(feb) ? Promise.reject(new Error('timeout')) : []),
    });
    await expect(internals(service).getEngagementRawData(RANGE_START, RANGE_END)).resolves.toEqual({
      activityByMonth: [], groupRecords: [], adultContactIds: [],
    });
    expect(errorSpy).toHaveBeenCalledWith('Error fetching engagement raw data:', expect.any(Error));
  });

  // BUG (reported): same cached-empty catch as above. filterAdultContacts
  // propagates, and getEngagementRawData's catch turns that into empty data
  // that getCachedEngagementData then caches. The fix (rethrow, so the stale
  // value is served) will fail this test: invert it then.
  it('returns all-empty data when the adult filter read fails (current behaviour)', async () => {
    engagementFixture({ Contacts: () => Promise.reject(new Error('boom')) });
    await expect(internals(service).getEngagementRawData(RANGE_START, RANGE_END)).resolves.toEqual({
      activityByMonth: [], groupRecords: [], adultContactIds: [],
    });
    expect(errorSpy).toHaveBeenCalledWith('Error fetching engagement raw data:', expect.any(Error));
  });

  // BUG (reported): getServingContactIds swallows its own errors, so a failed
  // serving read silently leaves serving-only adults out of adultContactIds.
  // filterDashboardData intersects serving records with that set, so the venn's
  // serving circle shrinks with no error, and the result is cached.
  it('silently drops serving-only adults when the serving read fails (current behaviour)', async () => {
    engagementFixture({ Group_Roles: () => Promise.reject(new Error('boom')) });
    const result = await internals(service).getEngagementRawData(RANGE_START, RANGE_END);

    expect(result.activityByMonth).not.toEqual([]); // the rest still comes back
    expect(result.adultContactIds).not.toContain(1005);
    expect(errorSpy).toHaveBeenCalledWith('Error fetching serving contact IDs:', expect.any(Error));
  });
});

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

describe('getEngagementDashboardData', () => {
  it('returns the raw engagement data with a zeroed overlap for the client to compute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 20, 9));
    route({
      Activity_Log: () => [{ Contact_ID: 1001 }],
      Contacts: () => [{ Contact_ID: 1001, Date_of_Birth: null }],
    });

    const data = await service.getEngagementDashboardData(new Date(2026, 0, 1), new Date(2026, 7, 31));

    expect(data).toEqual({
      engagementOverlap: {
        activityOnly: 0, groupOnly: 0, servingOnly: 0,
        activityAndGroup: 0, activityAndServing: 0, groupAndServing: 0,
        allThree: 0, totalActivity: 0, totalGroup: 0, totalServing: 0,
      },
      engagementRawData: {
        activityByMonth: [{ month: '2026-01', contactIds: [1001] }],
        groupRecords: [],
        adultContactIds: [1001],
      },
    });
  });
});

describe('getExtendedDashboardData', () => {
  function extendedFixture(overrides: Partial<Record<string, Handler>> = {}) {
    route({
      // Events is read two ways: by date range (event participants by month)
      // and by ID list (roster attendance dates)
      Events: (p) =>
        p.filter?.startsWith('Event_ID IN')
          ? [{ Event_ID: 500, Event_Start_Date: '2025-10-05T09:00:00' }]
          : [{ Event_ID: 600, Event_Start_Date: '2025-11-02T09:00:00' }],
      Event_Participants: (p) =>
        p.filter?.startsWith('Event_ID IN')
          ? [{ Event_ID: 600, Participant_ID: 77 }]
          : [{ Event_ID: 500, Group_ID: 1, Participant_ID: 10 }],
      Groups: () => [{ Group_ID: 1, Group_Type_ID: 1 }],
      Group_Types: () => [{ Group_Type_ID: 1, Group_Type: 'Small Group' }],
      Group_Participants: (p) =>
        p.filter?.includes('Group_Role_ID IN')
          ? [{ Participant_ID: 20, Group_Role_ID: 3, Start_Date: '2025-09-01T00:00:00', End_Date: null }]
          : [{ Group_ID: 1, Participant_ID: 10, Start_Date: '2025-09-01T00:00:00', End_Date: null }],
      Group_Roles: () => [{ Group_Role_ID: 3, Group_Role_Type_ID: 3, Ministry_ID: null }],
      Group_Role_Types: () => [{ Group_Role_Type_ID: 3, Group_Role_Type: 'Servant' }],
      Participants: participantsHandler(),
      ...overrides,
    } as Record<string, Handler>);
  }

  it('assembles event, roster/attendance and serving data over the full range', async () => {
    extendedFixture();
    const data = await service.getExtendedDashboardData(START, END);

    expect(data).toEqual({
      eventParticipantsByMonth: [{ month: '2025-11', participantIds: [77] }],
      rosterMemberRecords: [{
        contactId: 1010, groupTypeId: 1, groupTypeName: 'Small Group',
        startDate: '2025-09-01T00:00:00', endDate: null,
      }],
      attendanceByMonth: [{ month: '2025-10', groupTypeId: 1, groupTypeName: 'Small Group', contactIds: [1010] }],
      uniqueEventParticipants: 0,
      rosterVsAttendance: [],
      servingLeadingRecords: [{
        contactId: 1020, roleTypeId: 3, roleTypeName: 'Servant',
        ministryId: null, ministryName: null,
        startDate: '2025-09-01T00:00:00', endDate: null,
      }],
      servingTrends: [],
      servingByRoleType: [],
      servingByMinistry: [],
      totalServingLeading: 0,
    });

    // All three reads use the same full range: events, roster groups, and
    // serving participants.
    expect(callsFor('Events')).toContainEqual(expect.objectContaining({
      filter: `Event_Start_Date >= '${START_ISO}' AND Event_End_Date <= '${END_ISO}' AND Cancelled = 0`,
    }));
    expect(callsFor('Groups')).toEqual([expect.objectContaining({
      filter: `Group_Type_ID IN (1, 3, 11) AND ${ACTIVE_RANGE}`,
    })]);
    expect(callsFor('Group_Participants')).toContainEqual(expect.objectContaining({
      select: 'Participant_ID,Group_Role_ID,Start_Date,End_Date',
      filter: `Group_Role_ID IN (3) AND ${ACTIVE_RANGE}`,
    }));
  });

  // BUG (reported): this "isolation" is the cached-empty catch in
  // getRosterAndAttendanceRaw (see 'returns empty data and logs when an MP read
  // fails'). Inside getCachedExtendedData it caches an empty roster over the
  // previous good value. The fix (rethrow, so the stale value is served) will
  // fail this test: invert it then, rather than reading it as a regression.
  it('a broken roster read returns an empty roster beside intact serving and event data (current behaviour)', async () => {
    extendedFixture({ Groups: () => Promise.reject(new Error('boom')) });
    const data = await service.getExtendedDashboardData(START, END);

    expect(data.rosterMemberRecords).toEqual([]);
    expect(data.attendanceByMonth).toEqual([]);
    expect(data.servingLeadingRecords).toHaveLength(1);
    expect(data.eventParticipantsByMonth).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledWith('Error fetching roster and attendance raw data:', expect.any(Error));
  });
});
