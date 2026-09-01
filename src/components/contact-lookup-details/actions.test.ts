import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRequireFeatureAccess,
  mockEnforceRateLimit,
  mockGetContactLogsByContactId,
  mockGetContactLogTypes,
  mockGetHouseholdMembers,
  mockGetContactBadges,
  mockGetContactGroupMemberships,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockGetContactLogsByContactId: vi.fn(),
  mockGetContactLogTypes: vi.fn(),
  mockGetHouseholdMembers: vi.fn(),
  mockGetContactBadges: vi.fn(),
  mockGetContactGroupMemberships: vi.fn(),
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
