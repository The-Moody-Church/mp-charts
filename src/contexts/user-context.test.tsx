import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { ReactNode } from 'react';

const { mockUseSession, mockGetCurrentUserProfile, mockGetUserAuthorization } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockGetCurrentUserProfile: vi.fn(),
  mockGetUserAuthorization: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: mockUseSession,
  },
}));

vi.mock('@/components/shared-actions/user', () => ({
  getCurrentUserProfile: mockGetCurrentUserProfile,
  getUserAuthorization: mockGetUserAuthorization,
}));

import { UserProvider, useUser } from './user-context';

const mockAuthResult = {
  accessibleFeatures: ['dashboard', 'contact-lookup'] as string[],
  isSuperAdmin: false,
  journeyTools: [],
  complianceTools: [],
  feedbackEnabled: false,
};

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <UserProvider>{children}</UserProvider>;
  };
}

describe('UserContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserAuthorization.mockResolvedValue(mockAuthResult);
  });

  describe('useUser', () => {
    it('should throw when used outside UserProvider', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useUser());
      }).toThrow('useUser must be used within a UserProvider');

      spy.mockRestore();
    });
  });

  describe('UserProvider', () => {
    it('should load profile and authorization when session has userGuid', async () => {
      const mockProfile = {
        User_ID: 1,
        User_GUID: 'guid-123',
        First_Name: 'John',
        Last_Name: 'Doe',
        roles: ['Staff'],
        userGroups: ['Editors'],
        userGroupIds: [29],
      };

      mockUseSession.mockReturnValue({
        data: { user: { id: 'internal-id', userGuid: 'guid-123' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockResolvedValueOnce(mockProfile);

      const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.userProfile).toEqual(mockProfile);
      expect(result.current.accessibleFeatures).toEqual(mockAuthResult.accessibleFeatures);
      expect(result.current.isSuperAdmin).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockGetCurrentUserProfile).toHaveBeenCalledWith('guid-123');
      expect(mockGetUserAuthorization).toHaveBeenCalledWith('guid-123');
    });

    it('should set null profile when no session', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        isPending: false,
      });

      const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.userProfile).toBeNull();
      expect(result.current.accessibleFeatures).toEqual([]);
      expect(mockGetCurrentUserProfile).not.toHaveBeenCalled();
    });

    it('should not fetch profile when session has no userGuid', () => {
      mockUseSession.mockReturnValue({
        data: { user: { id: 'internal-id' } },
        isPending: false,
      });

      const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

      expect(result.current.userProfile).toBeNull();
      expect(mockGetCurrentUserProfile).not.toHaveBeenCalled();
    });

    it('should handle profile load error', async () => {
      mockUseSession.mockReturnValue({
        data: { user: { id: 'internal-id', userGuid: 'guid-123' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.userProfile).toBeNull();
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
    });

    it('should refresh profile when refreshUserProfile is called', async () => {
      const mockProfile = { User_ID: 1, User_GUID: 'guid-123', First_Name: 'John' };
      const updatedProfile = { User_ID: 1, User_GUID: 'guid-123', First_Name: 'Jane' };

      mockUseSession.mockReturnValue({
        data: { user: { id: 'internal-id', userGuid: 'guid-123' } },
        isPending: false,
      });
      mockGetCurrentUserProfile
        .mockResolvedValueOnce(mockProfile)
        .mockResolvedValueOnce(updatedProfile);

      const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.userProfile).toEqual(mockProfile);
      });

      await act(async () => {
        await result.current.refreshUserProfile();
      });

      expect(result.current.userProfile).toEqual(updatedProfile);
      expect(mockGetCurrentUserProfile).toHaveBeenCalledTimes(2);
    });

    it('should reset all fields on error', async () => {
      mockUseSession.mockReturnValue({
        data: { user: { id: 'internal-id', userGuid: 'guid-123' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockRejectedValueOnce(new Error('fail'));

      const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.userProfile).toBeNull();
      expect(result.current.accessibleFeatures).toEqual([]);
      expect(result.current.journeyTools).toEqual([]);
      expect(result.current.complianceTools).toEqual([]);
      expect(result.current.isSuperAdmin).toBe(false);
      expect(result.current.feedbackEnabled).toBe(false);
    });
  });
});
