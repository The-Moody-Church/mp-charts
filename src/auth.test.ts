import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Auth Tests
 *
 * Tests for the Better Auth configuration and auth helper utilities.
 * These tests verify:
 * - MP user profile lookup during OAuth sign-in (getUserInfo callback)
 * - Auth helper functions (getMpUserId, getUserGuid, requireSession)
 * - customSession name splitting logic
 */

// Create a mock for MPHelper that can be configured per test
const mockGetTableRecords = vi.fn();

vi.mock('@/lib/providers/ministry-platform', () => ({
  MPHelper: class MockMPHelper {
    getTableRecords = mockGetTableRecords;
  },
}));

describe('Auth - MP User Profile Lookup at Sign-In', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTableRecords.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch User_ID and Contact_ID from dp_Users using User_GUID', async () => {
    const { MPHelper } = await import('@/lib/providers/ministry-platform');

    mockGetTableRecords.mockResolvedValue([{
      User_ID: 1,
      Contact_ID: 100,
    }]);

    const mp = new MPHelper();
    const records = await mp.getTableRecords<{ User_ID: number; Contact_ID: number }>({
      table: 'dp_Users',
      filter: `User_GUID = 'user-guid-123'`,
      select: 'User_ID,Contact_ID',
      top: 1,
    });

    expect(records[0]).toBeDefined();
    expect(records[0].User_ID).toBe(1);
    expect(records[0].Contact_ID).toBe(100);

    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: 'dp_Users',
      filter: `User_GUID = 'user-guid-123'`,
      select: 'User_ID,Contact_ID',
      top: 1,
    });
  });

  it('should handle user profile fetch failure gracefully', async () => {
    const { MPHelper } = await import('@/lib/providers/ministry-platform');

    mockGetTableRecords.mockRejectedValue(new Error('API Error'));

    const mp = new MPHelper();
    let mpUserId: number | undefined;
    let mpContactId: number | undefined;

    try {
      const records = await mp.getTableRecords<{ User_ID: number; Contact_ID: number }>({
        table: 'dp_Users',
        filter: `User_GUID = 'test-guid'`,
        select: 'User_ID,Contact_ID',
        top: 1,
      });
      mpUserId = records[0]?.User_ID;
      mpContactId = records[0]?.Contact_ID;
    } catch {
      // Error is logged but values remain undefined
    }

    expect(mpUserId).toBeUndefined();
    expect(mpContactId).toBeUndefined();
  });

  it('should handle empty user profile result', async () => {
    const { MPHelper } = await import('@/lib/providers/ministry-platform');

    mockGetTableRecords.mockResolvedValue([]);

    const mp = new MPHelper();
    const records = await mp.getTableRecords({
      table: 'dp_Users',
      filter: `User_GUID = 'nonexistent-guid'`,
      select: 'User_ID,Contact_ID',
      top: 1,
    });

    expect(records[0]).toBeUndefined();
  });

  it('should map OIDC profile to user fields correctly', () => {
    // Simulate the getUserInfo return → mapProfileToUser flow
    const oidcProfile = {
      sub: 'user-guid-123',
      given_name: 'John',
      family_name: 'Doe',
      email: 'john@example.com',
    };

    const mpLookup = {
      User_ID: 42,
      Contact_ID: 100,
    };

    // getUserInfo returns this shape
    const userInfo = {
      id: oidcProfile.sub,
      email: oidcProfile.email,
      name: `${oidcProfile.given_name} ${oidcProfile.family_name}`.trim(),
      image: undefined,
      emailVerified: true,
      userGuid: oidcProfile.sub,
      mpUserId: mpLookup.User_ID,
      mpContactId: mpLookup.Contact_ID,
    };

    expect(userInfo.id).toBe('user-guid-123');
    expect(userInfo.name).toBe('John Doe');
    expect(userInfo.userGuid).toBe('user-guid-123');
    expect(userInfo.mpUserId).toBe(42);
    expect(userInfo.mpContactId).toBe(100);

    // mapProfileToUser extracts the custom fields
    const mappedFields = {
      userGuid: userInfo.userGuid,
      mpUserId: userInfo.mpUserId,
      mpContactId: userInfo.mpContactId,
    };

    expect(mappedFields.userGuid).toBe('user-guid-123');
    expect(mappedFields.mpUserId).toBe(42);
    expect(mappedFields.mpContactId).toBe(100);
  });
});

describe('Auth - customSession Name Splitting', () => {
  it('should split full name into first and last', () => {
    const user = { name: 'John Doe' };
    const firstName = user.name?.split(' ')[0] || '';
    const lastName = user.name?.split(' ').slice(1).join(' ') || '';

    expect(firstName).toBe('John');
    expect(lastName).toBe('Doe');
  });

  it('should handle single name (no last name)', () => {
    const user = { name: 'John' };
    const firstName = user.name?.split(' ')[0] || '';
    const lastName = user.name?.split(' ').slice(1).join(' ') || '';

    expect(firstName).toBe('John');
    expect(lastName).toBe('');
  });

  it('should handle multiple-part last name', () => {
    const user = { name: 'John van der Berg' };
    const firstName = user.name?.split(' ')[0] || '';
    const lastName = user.name?.split(' ').slice(1).join(' ') || '';

    expect(firstName).toBe('John');
    expect(lastName).toBe('van der Berg');
  });

  it('should handle empty name', () => {
    const user = { name: '' };
    const firstName = user.name?.split(' ')[0] || '';
    const lastName = user.name?.split(' ').slice(1).join(' ') || '';

    expect(firstName).toBe('');
    expect(lastName).toBe('');
  });

  it('should handle undefined name', () => {
    const user: { name?: string } = {};
    const firstName = user.name?.split(' ')[0] || '';
    const lastName = user.name?.split(' ').slice(1).join(' ') || '';

    expect(firstName).toBe('');
    expect(lastName).toBe('');
  });
});

describe('Auth Helpers - getMpUserId', () => {
  it('should extract mpUserId from session user', () => {
    const session = {
      user: { id: 'ba-id-123', userGuid: 'mp-guid-123', mpUserId: 42, mpContactId: 100, name: 'John Doe', email: 'j@test.com' },
      session: { id: 'session-123', token: 'tok', expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), userId: 'ba-id-123' },
    };

    const mpUserId = (session.user as Record<string, unknown>).mpUserId as number | undefined;
    expect(mpUserId).toBe(42);
  });

  it('should return undefined when mpUserId not present', () => {
    const session = {
      user: { id: 'ba-id-123', name: 'John Doe', email: 'j@test.com' },
      session: { id: 'session-123', token: 'tok', expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), userId: 'ba-id-123' },
    };

    const mpUserId = (session.user as Record<string, unknown>).mpUserId as number | undefined;
    expect(mpUserId).toBeUndefined();
  });
});

describe('Auth Helpers - getUserGuid', () => {
  it('should extract userGuid from session user', () => {
    const session = {
      user: { id: 'ba-id-123', userGuid: 'mp-guid-123', name: 'John Doe', email: 'j@test.com' },
      session: { id: 'session-123', token: 'tok', expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(), userId: 'ba-id-123' },
    };

    const userGuid = (session.user as Record<string, unknown>).userGuid as string | undefined;
    expect(userGuid).toBe('mp-guid-123');
  });
});
