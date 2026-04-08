import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import {
  getSession,
  requireSession,
  getMpUserId,
  getUserGuid,
  getMpContactId,
} from './auth-helpers';

describe('getSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns session when authenticated', async () => {
    const session = { user: { id: 'u1', name: 'Test' } };
    mockGetSession.mockResolvedValueOnce(session);
    const result = await getSession();
    expect(result).toEqual(session);
  });

  it('returns null when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await getSession();
    expect(result).toBeNull();
  });
});

describe('requireSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
  });

  it('returns session when authenticated and within rate limit', async () => {
    const session = { user: { id: 'u1', name: 'Test' } };
    mockGetSession.mockResolvedValueOnce(session);
    const result = await requireSession();
    expect(result).toEqual(session);
    expect(mockCheckRateLimit).toHaveBeenCalledWith('u1', 'general');
  });

  it('throws when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    await expect(requireSession()).rejects.toThrow('Authentication required');
  });

  it('throws when session has no user', async () => {
    mockGetSession.mockResolvedValueOnce({ user: null });
    await expect(requireSession()).rejects.toThrow('Authentication required');
  });

  it('throws when rate limited', async () => {
    const session = { user: { id: 'u1', name: 'Test' } };
    mockGetSession.mockResolvedValueOnce(session);
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 5000 });
    await expect(requireSession()).rejects.toThrow('Rate limit exceeded. Try again in 5 seconds.');
  });

  it('rounds up retry-after seconds', async () => {
    const session = { user: { id: 'u1', name: 'Test' } };
    mockGetSession.mockResolvedValueOnce(session);
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 1500 });
    await expect(requireSession()).rejects.toThrow('Try again in 2 seconds');
  });
});

describe('session field extractors', () => {
  const session = {
    user: {
      id: 'u1',
      mpUserId: 42,
      userGuid: 'abc-123',
      mpContactId: 100,
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it('getMpUserId extracts mpUserId', () => {
    expect(getMpUserId(session)).toBe(42);
  });

  it('getUserGuid extracts userGuid', () => {
    expect(getUserGuid(session)).toBe('abc-123');
  });

  it('getMpContactId extracts mpContactId', () => {
    expect(getMpContactId(session)).toBe(100);
  });

  it('returns undefined when fields are missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const minimal = { user: { id: 'u1' } } as any;
    expect(getMpUserId(minimal)).toBeUndefined();
    expect(getUserGuid(minimal)).toBeUndefined();
    expect(getMpContactId(minimal)).toBeUndefined();
  });
});
