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

    // ---------------------------------------------------------------------
    // Characterization tests — added 2026-08-07 before refactoring the
    // setState-in-effect pattern flagged by react-hooks/set-state-in-effect
    // (eslint-plugin-react-hooks 7.1). These pin down behavior the existing
    // suite did not cover, so the refactor can be proven not to change it.
    // If one of these fails after a change here, the change is wrong.
    // ---------------------------------------------------------------------

    it('should stay loading while the session is still pending', () => {
      mockUseSession.mockReturnValue({
        data: undefined,
        isPending: true,
      });

      const { result } = renderHook(() => useUser(), { wrapper: createWrapper() });

      // Must NOT resolve to "signed out" while auth is still resolving —
      // otherwise the app flashes an unauthenticated shell on every load.
      expect(result.current.isLoading).toBe(true);
      expect(result.current.userProfile).toBeNull();
      expect(mockGetCurrentUserProfile).not.toHaveBeenCalled();
    });

    it('should reload the profile when userGuid changes to a different user', async () => {
      const profileA = { User_ID: 1, User_GUID: 'guid-A', First_Name: 'Ann', Last_Name: 'A', roles: [], userGroups: [], userGroupIds: [1] };
      const profileB = { User_ID: 2, User_GUID: 'guid-B', First_Name: 'Bob', Last_Name: 'B', roles: [], userGroups: [], userGroupIds: [2] };

      mockUseSession.mockReturnValue({
        data: { user: { id: 'id-A', userGuid: 'guid-A' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockResolvedValueOnce(profileA);

      const { result, rerender } = renderHook(() => useUser(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.userProfile).toEqual(profileA);

      // Switch identity — the provider must refetch, not serve user A's data.
      mockUseSession.mockReturnValue({
        data: { user: { id: 'id-B', userGuid: 'guid-B' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockResolvedValueOnce(profileB);
      rerender();

      await waitFor(() => expect(result.current.userProfile).toEqual(profileB));
      expect(mockGetCurrentUserProfile).toHaveBeenLastCalledWith('guid-B');
    });

    it('should not refetch when re-rendered with an unchanged session', async () => {
      const profile = { User_ID: 1, User_GUID: 'guid-123', First_Name: 'John', Last_Name: 'Doe', roles: [], userGroups: [], userGroupIds: [29] };

      mockUseSession.mockReturnValue({
        data: { user: { id: 'internal-id', userGuid: 'guid-123' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockResolvedValue(profile);

      const { result, rerender } = renderHook(() => useUser(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const callsAfterInitialLoad = mockGetCurrentUserProfile.mock.calls.length;
      rerender();
      rerender();

      // Guards against a refactor that re-runs the load on every render —
      // that would hammer the MP API on an already-rate-limited endpoint.
      expect(mockGetCurrentUserProfile.mock.calls.length).toBe(callsAfterInitialLoad);
    });

    // ---------------------------------------------------------------------
    // The 2026-08-12 rewrite tags each load with the userGuid it was made for and
    // derives the context value from that, instead of clearing six state variables
    // from an effect.
    //
    // The first test below is ADDED behavior — it fails against the old provider,
    // which kept the previous user's data in state until the next load resolved.
    // The second is a regression guard for the derivation itself: it passes both
    // before and after, because `isLoading` used to be stored state that a session
    // refetch couldn't disturb. Deriving it from `isPending` naively would have
    // flashed the whole app back into a loading shell.
    // ---------------------------------------------------------------------

    it('should not serve the previous user\'s data while the next user loads', async () => {
      const profileA = { User_ID: 1, User_GUID: 'guid-A', First_Name: 'Ann', Last_Name: 'A', roles: [], userGroups: [], userGroupIds: [1] };

      mockUseSession.mockReturnValue({
        data: { user: { id: 'id-A', userGuid: 'guid-A' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockResolvedValueOnce(profileA);

      const { result, rerender } = renderHook(() => useUser(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.userProfile).toEqual(profileA));

      // Switch identity, with user B's load left hanging.
      mockUseSession.mockReturnValue({
        data: { user: { id: 'id-B', userGuid: 'guid-B' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockImplementation(() => new Promise(() => {}));
      rerender();

      // The old provider kept A's profile in state until B resolved, so A's PII and
      // A's feature list were briefly served under B's session.
      await waitFor(() => expect(result.current.isLoading).toBe(true));
      expect(result.current.userProfile).toBeNull();
      expect(result.current.accessibleFeatures).toEqual([]);
    });

    it('should not flash loading when the session refetches with data already held', async () => {
      const profile = { User_ID: 1, User_GUID: 'guid-123', First_Name: 'John', Last_Name: 'Doe', roles: [], userGroups: [], userGroupIds: [29] };
      const sessionData = { user: { id: 'internal-id', userGuid: 'guid-123' } };

      mockUseSession.mockReturnValue({ data: sessionData, isPending: false });
      mockGetCurrentUserProfile.mockResolvedValue(profile);

      const { result, rerender } = renderHook(() => useUser(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // A background session refetch flips isPending while keeping the session.
      mockUseSession.mockReturnValue({ data: sessionData, isPending: true });
      rerender();

      // isLoading is derived, so it must not turn the whole app back into a
      // loading shell for data that is already held and still current.
      expect(result.current.isLoading).toBe(false);
      expect(result.current.userProfile).toEqual(profile);
    });

    it('should clear a previously loaded profile when the session goes away', async () => {
      const profile = { User_ID: 1, User_GUID: 'guid-123', First_Name: 'John', Last_Name: 'Doe', roles: [], userGroups: [], userGroupIds: [29] };

      mockUseSession.mockReturnValue({
        data: { user: { id: 'internal-id', userGuid: 'guid-123' } },
        isPending: false,
      });
      mockGetCurrentUserProfile.mockResolvedValueOnce(profile);

      const { result, rerender } = renderHook(() => useUser(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.userProfile).toEqual(profile));

      // Sign out — stale PII must not linger in context.
      mockUseSession.mockReturnValue({ data: null, isPending: false });
      rerender();

      await waitFor(() => expect(result.current.userProfile).toBeNull());
      expect(result.current.accessibleFeatures).toEqual([]);
      expect(result.current.isSuperAdmin).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });
});
