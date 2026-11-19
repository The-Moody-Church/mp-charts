import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRequireFeatureAccess,
  mockEnforceRateLimit,
  mockGetContactLogsByContactId,
  mockGetContactLogTypes,
  mockGetHouseholdMembers,
  mockGetContactBadges,
  mockGetContactGroupMemberships,
  mockMpGetTableRecords,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockGetContactLogsByContactId: vi.fn(),
  mockGetContactLogTypes: vi.fn(),
  mockGetHouseholdMembers: vi.fn(),
  mockGetContactBadges: vi.fn(),
  mockGetContactGroupMemberships: vi.fn(),
  mockMpGetTableRecords: vi.fn(),
}));

vi.mock('@/lib/authorization', () => ({
  requireFeatureAccess: mockRequireFeatureAccess,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

vi.mock('@/services/contactLogService', () => ({
  ContactLogService: {
    getInstance: vi.fn().mockResolvedValue({
      getContactLogsByContactId: mockGetContactLogsByContactId,
      getContactLogTypes: mockGetContactLogTypes,
    }),
  },
}));

vi.mock('@/services/contactService', () => ({
  ContactService: {
    getInstance: vi.fn().mockResolvedValue({
      getHouseholdMembers: mockGetHouseholdMembers,
      getContactBadges: mockGetContactBadges,
      getContactGroupMemberships: mockGetContactGroupMemberships,
    }),
  },
}));

vi.mock('@/lib/providers/ministry-platform', () => ({
  MPHelper: class {
    getTableRecords = mockMpGetTableRecords;
  },
}));

vi.mock('@/components/shared-actions/processing', () => ({
  uploadContactPhoto: vi.fn(),
}));

import {
  getContactLogsByContactId,
  getHouseholdMembers,
  getContactBadges,
  getContactGroups,
} from './actions';

/**
 * Upstream #75 adaptation: these four actions now route their ID arguments
 * through sanitizeId() instead of the truthiness guard `!id || id <= 0`, which
 * a type-erased injection string like "1 OR 1=1" passed. Each action's
 * existing failure contract is preserved (throw vs. safe fallback).
 */
describe('type-erased ID rejection (sanitizeId at the action boundary)', () => {
  const INJECTION = '1 OR 1=1' as unknown as number;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireFeatureAccess.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('getContactLogsByContactId rejects an injection string without touching the service', async () => {
    await expect(getContactLogsByContactId(INJECTION)).rejects.toThrow(
      'Failed to fetch contact logs'
    );
    expect(mockGetContactLogsByContactId).not.toHaveBeenCalled();
  });

  it('getHouseholdMembers rejects an injection string without touching the service', async () => {
    await expect(getHouseholdMembers(INJECTION)).rejects.toThrow(
      'Failed to fetch household members'
    );
    expect(mockGetHouseholdMembers).not.toHaveBeenCalled();
  });

  it('getContactBadges falls back to the empty badge set without touching the service', async () => {
    const badges = await getContactBadges(INJECTION);
    expect(badges.membershipStatus).toBeNull();
    expect(badges.inGroup).toBe(false);
    expect(mockGetContactBadges).not.toHaveBeenCalled();
  });

  it('getContactGroups falls back to an empty list without touching the service', async () => {
    expect(await getContactGroups(INJECTION)).toEqual([]);
    expect(mockGetContactGroupMemberships).not.toHaveBeenCalled();
  });

  it('valid numeric ids still reach the service (coercing numeric strings)', async () => {
    mockGetContactLogsByContactId.mockResolvedValue([]);
    mockGetContactLogTypes.mockResolvedValue([]);
    mockGetHouseholdMembers.mockResolvedValue([]);

    await getContactLogsByContactId(42);
    expect(mockGetContactLogsByContactId).toHaveBeenCalledWith(42);

    await getHouseholdMembers('7' as unknown as number);
    expect(mockGetHouseholdMembers).toHaveBeenCalledWith(7);
  });
});

/**
 * upstream 710dfa8 (adapted): the contact-log read returns only what
 * contact-logs.tsx renders or needs. A spread of the MP row, or a wider
 * dp_Users select, would put the link/flag columns and each staff author's
 * email, phone and Contact_ID back into the browser; these exact key sets
 * fail if either comes back.
 */
describe('getContactLogsByContactId returns minimal DTOs', () => {
  const fullRow = {
    Contact_Log_ID: 11,
    Contact_ID: 42,
    Contact_Date: '2026-11-01T12:00:00',
    Made_By: 7,
    Notes: 'Visited',
    Contact_Log_Type_ID: 3,
    Planned_Contact_ID: 501,
    Contact_Successful: true,
    Original_Contact_Log_Entry: 9,
    Feedback_Entry_ID: 77,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireFeatureAccess.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetContactLogsByContactId.mockResolvedValue([
      fullRow,
      { ...fullRow, Contact_Log_ID: 12, Made_By: 8, Contact_Log_Type_ID: null },
    ]);
    mockGetContactLogTypes.mockResolvedValue([
      { Contact_Log_Type_ID: 3, Contact_Log_Type: 'Visit' },
    ]);
    // What MP would return if the select were wide: the extra columns must
    // still not be copied into the DTO.
    mockMpGetTableRecords.mockResolvedValue([
      {
        User_ID: 7,
        Contact_ID: 900,
        First_Name: 'Pat',
        Nickname: 'P',
        Last_Name: 'Pastor',
        Email_Address: 'pat@example.org',
        Mobile_Phone: '555-0100',
        Image_GUID: 'img',
      },
    ]);
  });

  it('returns each log with exactly the rendered fields', async () => {
    const logs = await getContactLogsByContactId(42);

    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(Object.keys(log).sort()).toEqual([
        'Contact_Date',
        'Contact_Log_ID',
        'Contact_Log_Type',
        'Contact_Log_Type_ID',
        'MadeByContact',
        'Made_By',
        'Notes',
      ]);
    }
    expect(logs[0]).toEqual({
      Contact_Log_ID: 11,
      Contact_Date: '2026-11-01T12:00:00',
      Notes: 'Visited',
      Contact_Log_Type: 'Visit',
      Contact_Log_Type_ID: 3,
      Made_By: 7,
      MadeByContact: [{ First_Name: 'Pat', Nickname: 'P', Last_Name: 'Pastor' }],
    });
    // Author not found: no name, but the log and its Made_By still come back.
    expect(logs[1].MadeByContact).toBeUndefined();
    expect(logs[1].Made_By).toBe(8);
    expect(logs[1].Contact_Log_Type).toBeNull();
  });

  it('gives MadeByContact only the three name fields', async () => {
    const [log] = await getContactLogsByContactId(42);

    expect(Object.keys(log.MadeByContact![0]).sort()).toEqual([
      'First_Name',
      'Last_Name',
      'Nickname',
    ]);
  });

  // Both catches log errorForLog(error): one line, control characters
  // stripped, never the raw Error (CodeQL js/log-injection).
  describe('error logging is one safe line', () => {
    const forged = new Error('boom\r\n[forged] admin signed in');

    function expectSafeLog(spy: ReturnType<typeof vi.spyOn>, label: string) {
      expect(spy).toHaveBeenCalledTimes(1);
      const args = spy.mock.calls[0];
      expect(args).toEqual([label, 'Error: boom[forged] admin signed in']);
    }

    it('the Made_By name lookup (non-fatal)', async () => {
      mockMpGetTableRecords.mockRejectedValueOnce(forged);
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const logs = await getContactLogsByContactId(42);
        expect(logs).toHaveLength(2);
        expect(logs[0].MadeByContact).toBeUndefined();
        expectSafeLog(spy, 'Error fetching Made_By contact info:');
      } finally {
        spy.mockRestore();
      }
    });

    it('the outer catch', async () => {
      mockGetContactLogsByContactId.mockRejectedValueOnce(forged);
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(getContactLogsByContactId(42)).rejects.toThrow('Failed to fetch contact logs');
        expectSafeLog(spy, 'Error fetching contact logs:');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('selects only User_ID and the three name columns from dp_Users', async () => {
    await getContactLogsByContactId(42);

    expect(mockMpGetTableRecords).toHaveBeenCalledTimes(1);
    const params = mockMpGetTableRecords.mock.calls[0][0];
    expect(params.table).toBe('dp_Users');
    expect(params.filter).toBe('User_ID IN (7,8)');
    expect(params.select.split(',').sort()).toEqual([
      'Contact_ID_TABLE.First_Name',
      'Contact_ID_TABLE.Last_Name',
      'Contact_ID_TABLE.Nickname',
      'User_ID',
    ]);
  });
});
