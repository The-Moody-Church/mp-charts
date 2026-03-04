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
  isLoading: boolean;
  error: Error | null;
  refreshUserProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const { data: session, isPending } = authClient.useSession();
  const [userProfile, setUserProfile] = useState<MPUserProfile | null>(null);
  const [accessibleFeatures, setAccessibleFeatures] = useState<Feature[]>([]);
  const [journeyTools, setJourneyTools] = useState<JourneyToolMeta[]>([]);
  const [complianceTools, setComplianceTools] = useState<ComplianceToolMeta[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const userGuid = (session?.user as Record<string, unknown> | undefined)?.userGuid as string | undefined;

  const loadUserProfile = useCallback(async () => {
    if (!userGuid) {
      setUserProfile(null);
      setAccessibleFeatures([]);
      setJourneyTools([]);
      setComplianceTools([]);
      setIsSuperAdmin(false);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const [profile, auth] = await Promise.all([
        getCurrentUserProfile(userGuid),
        getUserAuthorization(userGuid),
      ]);
      setUserProfile(profile ?? null);
      setAccessibleFeatures(auth.accessibleFeatures);
      setJourneyTools(auth.journeyTools);
      setComplianceTools(auth.complianceTools);
      setIsSuperAdmin(auth.isSuperAdmin);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to load user profile"));
      setUserProfile(null);
      setAccessibleFeatures([]);
      setJourneyTools([]);
      setComplianceTools([]);
      setIsSuperAdmin(false);
    } finally {
      setIsLoading(false);
    }
  }, [userGuid]);

  useEffect(() => {
    if (!isPending && session?.user) {
      loadUserProfile();
    } else if (!isPending && !session?.user) {
      setUserProfile(null);
      setAccessibleFeatures([]);
      setJourneyTools([]);
      setComplianceTools([]);
      setIsSuperAdmin(false);
      setIsLoading(false);
    }
  }, [userGuid, isPending, session?.user, loadUserProfile]);

  const refreshUserProfile = async () => {
    await loadUserProfile();
  };

  return (
    <UserContext.Provider value={{ userProfile, accessibleFeatures, journeyTools, complianceTools, isSuperAdmin, isLoading, error, refreshUserProfile }}>
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
