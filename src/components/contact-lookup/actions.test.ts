import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRequireFeatureAccess, mockEnforceRateLimit, mockGetCachedAllContacts } = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockGetCachedAllContacts: vi.fn(),
}));

vi.mock('@/lib/authorization', () => ({
  requireFeatureAccess: mockRequireFeatureAccess,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

vi.mock('./cached-contacts', () => ({
  getCachedAllContacts: mockGetCachedAllContacts,
}));

// Must also mock scoreNameMatch since it contains the scoring logic
// We want to test the action's orchestration, not the scoring algorithm itself
const { mockScoreNameMatch } = vi.hoisted(() => ({
  mockScoreNameMatch: vi.fn(),
}));

vi.mock('@/lib/processing-utils', () => ({
  scoreNameMatch: mockScoreNameMatch,
}));

import { searchContacts } from './actions';

const mockSession = {
  user: { id: 'user-1', userGuid: 'guid-123' },
};

const mockContacts = [
  { Contact_ID: 1, First_Name: 'John', Last_Name: 'Doe', Nickname: 'Johnny', Email_Address: 'john@example.com', Mobile_Phone: null, Contact_Status_ID: 1, Participant_Engagement_ID: 2 },
  { Contact_ID: 2, First_Name: 'Jane', Last_Name: 'Doe', Nickname: null, Email_Address: 'jane@example.com', Mobile_Phone: null, Contact_Status_ID: 1, Participant_Engagement_ID: 1 },
  { Contact_ID: 3, First_Name: 'Bob', Last_Name: 'Inactive', Nickname: null, Email_Address: null, Mobile_Phone: null, Contact_Status_ID: 2, Participant_Engagement_ID: null },
];

describe('searchContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScoreNameMatch.mockReset();
    mockRequireFeatureAccess.mockResolvedValue(mockSession);
    mockGetCachedAllContacts.mockResolvedValue(mockContacts);
  });

  it('should require feature access for contact-lookup', async () => {
    mockScoreNameMatch.mockReturnValue(0);
    await searchContacts('test');
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith('contact-lookup');
  });

  it('should enforce search rate limit', async () => {
    mockScoreNameMatch.mockReturnValue(0);
    await searchContacts('test');
    expect(mockEnforceRateLimit).toHaveBeenCalledWith('user-1', 'search');
  });

  it('should return empty array for empty search term', async () => {
    const result = await searchContacts('');
    expect(result).toEqual([]);
    expect(mockGetCachedAllContacts).not.toHaveBeenCalled();
  });

  it('should return empty array for whitespace-only search term', async () => {
    const result = await searchContacts('   ');
    expect(result).toEqual([]);
    expect(mockGetCachedAllContacts).not.toHaveBeenCalled();
  });

  it('should filter to active contacts by default', async () => {
    mockScoreNameMatch.mockReturnValue(10);
    const result = await searchContacts('Doe');

    // Contact 3 has Contact_Status_ID = 2 (inactive), should be excluded
    const ids = result.map(c => c.Contact_ID);
    expect(ids).not.toContain(3);
  });

  it('should include inactive contacts when activeOnly is false', async () => {
    mockScoreNameMatch.mockReturnValue(10);
    const result = await searchContacts('test', false);

    // All 3 contacts should be included since activeOnly=false and all score > 0
    expect(result).toHaveLength(3);
  });

  it('should exclude contacts with score 0', async () => {
    // Only first contact matches
    mockScoreNameMatch
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    const result = await searchContacts('John');

    expect(result).toHaveLength(1);
    expect(result[0].Contact_ID).toBe(1);
  });

  it('should sort by score descending', async () => {
    // scoreNameMatch(item, query) — use implementation to score by Contact_ID
    mockScoreNameMatch.mockImplementation((fields: Record<string, unknown>) => {
      return fields.Contact_ID === 1 ? 10 : 50;
    });

    const result = await searchContacts('Doe');

    expect(result).toHaveLength(2);
    expect(result[0].Contact_ID).toBe(2); // Jane scored higher (50)
    expect(result[1].Contact_ID).toBe(1); // John scored lower (10)
  });

  it('should use engagement priority as tie-breaker', async () => {
    // Same score, different engagement
    mockScoreNameMatch
      .mockReturnValueOnce(50) // John — Fully Engaged (2) → priority 0
      .mockReturnValueOnce(50); // Jane — Partially Engaged (1) → priority 1

    const result = await searchContacts('Doe');

    // John (engagement priority 0) should come before Jane (engagement priority 1)
    expect(result[0].Contact_ID).toBe(1);
    expect(result[1].Contact_ID).toBe(2);
  });

  it('should throw wrapped error on auth failure', async () => {
    mockRequireFeatureAccess.mockRejectedValueOnce(new Error('Forbidden'));

    await expect(searchContacts('test')).rejects.toThrow('Failed to search contacts');
  });

  it('should throw wrapped error on service failure', async () => {
    mockGetCachedAllContacts.mockRejectedValueOnce(new Error('API error'));

    await expect(searchContacts('test')).rejects.toThrow('Failed to search contacts');
  });
});
