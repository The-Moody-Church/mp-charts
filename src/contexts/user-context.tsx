"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { getCurrentUserProfile, getUserAuthorization, type JourneyToolMeta, type ComplianceToolMeta } from "@/components/shared-actions/user";
import type { Feature } from "@/lib/authorization";

interface UserContextValue {
  userProfile: MPUserProfile | null;
  accessibleFeatures: Feature[];
  journeyTools: JourneyToolMeta[];
  complianceTools: ComplianceToolMeta[];
  isSuperAdmin: boolean;
  feedbackEnabled: boolean;
  isLoading: boolean;
  error: Error | null;
  refreshUserProfile: () => Promise<void>;
}

/** Everything a single load produces. */
interface UserBootstrap {
  userProfile: MPUserProfile | null;
  accessibleFeatures: Feature[];
  journeyTools: JourneyToolMeta[];
  complianceTools: ComplianceToolMeta[];
  isSuperAdmin: boolean;
  feedbackEnabled: boolean;
}

/** What the context serves when nothing loaded belongs to the current session. */
const EMPTY_BOOTSTRAP: UserBootstrap = {
  userProfile: null,
  accessibleFeatures: [],
  journeyTools: [],
  complianceTools: [],
  isSuperAdmin: false,
  feedbackEnabled: false,
};

/**
 * A load, tagged with the userGuid it was made for.
 *
 * That tag is what retires react-hooks/set-state-in-effect here. The old effect
 * held two synchronous setState blocks — one inside the loader for the no-guid
 * case, one in an else-branch for sign-out — whose entire job was to wipe six
 * state variables back to their initial values. With the load tagged, "is this
 * data the current user's?" becomes a comparison, so signing out or switching
 * identity needs no effect and no wipe: the stored value simply stops matching and
 * the context serves EMPTY_BOOTSTRAP instead.
 */
type LoadState =
  | { status: "loading" }
  | { status: "ready"; guid: string; data: UserBootstrap }
  | { status: "failed"; guid: string; error: Error };

const UserContext = createContext<UserContextValue | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const { data: session, isPending } = authClient.useSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const userGuid = (session?.user as Record<string, unknown> | undefined)?.userGuid as string | undefined;

  // Pure fetch — returns the bootstrap and touches no state, so calling it from an
  // effect body is legal. The guid is still passed to both actions for call-site
  // compatibility; both ignore it and derive the GUID from the session (F4).
  const loadBootstrap = useCallback(async (guid: string): Promise<UserBootstrap> => {
    const [profile, auth] = await Promise.all([
      getCurrentUserProfile(guid),
      getUserAuthorization(guid),
    ]);
    return {
      userProfile: profile ?? null,
      accessibleFeatures: auth.accessibleFeatures,
      journeyTools: auth.journeyTools,
      complianceTools: auth.complianceTools,
      isSuperAdmin: auth.isSuperAdmin,
      feedbackEnabled: auth.feedbackEnabled,
    };
  }, []);

  const toError = (err: unknown) =>
    err instanceof Error ? err : new Error("Failed to load user profile");

  useEffect(() => {
    // No setState in this body at all. While the session is resolving, or when
    // there is no usable session, the derived values below already read as
    // "nothing loaded" — which is what the deleted else-branch used to arrange
    // by hand.
    if (isPending || !userGuid) return;

    let cancelled = false;
    loadBootstrap(userGuid)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", guid: userGuid, data });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "failed", guid: userGuid, error: toError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [isPending, userGuid, loadBootstrap]);

  // Event handler, so setState is unrestricted here.
  const refreshUserProfile = useCallback(async () => {
    if (!userGuid) return;
    setState({ status: "loading" });
    try {
      setState({ status: "ready", guid: userGuid, data: await loadBootstrap(userGuid) });
    } catch (err) {
      setState({ status: "failed", guid: userGuid, error: toError(err) });
    }
  }, [userGuid, loadBootstrap]);

  // Stored data belongs to whoever it was loaded for. If that is not the current
  // session's user — signed out, still resolving, or identity switched — it is not
  // served, which is why nothing has to clear it.
  const isCurrent = state.status !== "loading" && state.guid === userGuid;
  const data = isCurrent && state.status === "ready" ? state.data : EMPTY_BOOTSTRAP;
  const error = isCurrent && state.status === "failed" ? state.error : null;
  // Loading only while there is something to load FOR and it isn't loaded yet. No
  // session resolves straight to signed-out, as the old else-branch did; and a
  // session refetch while current data is already held does not flash the whole
  // app back into loading.
  const isLoading = !isCurrent && (isPending || !!userGuid);

  return (
    <UserContext.Provider value={{ ...data, isLoading, error, refreshUserProfile }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
