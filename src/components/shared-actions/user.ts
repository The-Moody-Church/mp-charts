'use server';

import { requireSession, getUserGuid } from "@/lib/auth-helpers";
import { getAccessibleFeatures, isSuperAdmin, type Feature } from "@/lib/authorization";
import { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { UserService } from '@/services/userService';
import { getEnabledJourneyTools } from "@/lib/journey-tools-config";
import { getEnabledComplianceTools } from "@/lib/compliance-tools-config";
import { isFeedbackEnabled } from "@/lib/feedback-config";

export interface JourneyToolMeta {
  slug: string;
  name: string;
  description: string;
}

export interface ComplianceToolMeta {
  slug: string;
  name: string;
  description: string;
}

/**
 * Fetches the CURRENT user's profile from Ministry Platform.
 *
 * SECURITY (F4): the user GUID is derived from the authenticated session, never
 * from a client argument. Accepting a client-supplied GUID here let any logged-in
 * user read another user's PII (and probe who is a super-admin). The legacy
 * parameter is retained for call-site compatibility but is intentionally ignored.
 * @returns The current user's profile data
 */
export async function getCurrentUserProfile(_requestedId?: string): Promise<MPUserProfile | undefined> {
  const session = await requireSession();
  const id = getUserGuid(session);
  if (!id) return undefined;
  const userService = await UserService.getInstance();
  return userService.getUserProfile(id);
}

/**
 * Returns the list of features accessible to the current user,
 * along with whether they are a super-admin.
 * Called by UserProvider at login to populate client-side authorization context.
 */
export async function getUserAuthorization(_requestedId?: string): Promise<{
  accessibleFeatures: Feature[];
  isSuperAdmin: boolean;
  journeyTools: JourneyToolMeta[];
  complianceTools: ComplianceToolMeta[];
  feedbackEnabled: boolean;
}> {
  // SECURITY (F4): derive the user GUID from the session, never from the client.
  const session = await requireSession();
  const id = getUserGuid(session);
  if (!id) {
    return { accessibleFeatures: [], isSuperAdmin: false, journeyTools: [], complianceTools: [], feedbackEnabled: false };
  }
  const userService = await UserService.getInstance();
  const profile = await userService.getUserProfile(id);
  if (!profile) {
    return { accessibleFeatures: [], isSuperAdmin: false, journeyTools: [], complianceTools: [], feedbackEnabled: false };
  }

  const enabledJourneys = getEnabledJourneyTools();
  const journeyTools: JourneyToolMeta[] = enabledJourneys.map((t) => ({
    slug: t.slug,
    name: t.journeyName,
    description: t.description,
  }));

  const enabledCompliance = getEnabledComplianceTools();
  const complianceTools: ComplianceToolMeta[] = enabledCompliance.map((t) => ({
    slug: t.slug,
    name: t.toolName,
    description: t.description,
  }));

  return {
    accessibleFeatures: getAccessibleFeatures(profile.userGroupIds),
    isSuperAdmin: isSuperAdmin(profile.userGroupIds),
    journeyTools,
    complianceTools,
    feedbackEnabled: isFeedbackEnabled(),
  };
}
