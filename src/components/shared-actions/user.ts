'use server';

import { requireSession, getUserGuid } from "@/lib/auth-helpers";
import { getAccessibleFeatures, isSuperAdmin, type Feature } from "@/lib/authorization";
import { toCurrentUserProfile, type CurrentUserProfile } from "@/lib/dto/user-profile";
import { UserService } from '@/services/userService';
import { getEnabledJourneyTools } from "@/lib/journey-tools-config";
import { getEnabledComplianceTools } from "@/lib/compliance-tools-config";

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
 *
 * Returns the `CurrentUserProfile` DTO, built field by field (upstream MPNext
 * 0670531, adapted): only what the header and user menu render. The MP row's
 * IDs, GUID, mobile phone and group IDs stay on the server. user.test.ts pins
 * the exact key set.
 * @returns The current user's display profile, or undefined when MP has no dp_Users row
 */
export async function getCurrentUserProfile(_requestedId?: string): Promise<CurrentUserProfile | undefined> {
  const session = await requireSession();
  const id = getUserGuid(session);
  if (!id) return undefined;
  const userService = await UserService.getInstance();
  const profile = await userService.getUserProfile(id);
  return profile ? toCurrentUserProfile(profile) : undefined;
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
}> {
  // SECURITY (F4): derive the user GUID from the session, never from the client.
  const session = await requireSession();
  const id = getUserGuid(session);
  if (!id) {
    return { accessibleFeatures: [], isSuperAdmin: false, journeyTools: [], complianceTools: [] };
  }
  const userService = await UserService.getInstance();
  const profile = await userService.getUserProfile(id);
  if (!profile) {
    return { accessibleFeatures: [], isSuperAdmin: false, journeyTools: [], complianceTools: [] };
  }

  // N10 follow-up: send only the tools this user may open. The sidebar and home
  // cards already hide the rest with canAccess(); filtering here keeps the other
  // tools' names and descriptions out of the browser too.
  const accessibleFeatures = getAccessibleFeatures(profile.userGroupIds);
  const accessible = new Set<string>(accessibleFeatures);

  const enabledJourneys = getEnabledJourneyTools().filter((t) => accessible.has(`journey:${t.slug}`));
  const journeyTools: JourneyToolMeta[] = enabledJourneys.map((t) => ({
    slug: t.slug,
    name: t.journeyName,
    description: t.description,
  }));

  const enabledCompliance = getEnabledComplianceTools().filter((t) => accessible.has(`compliance:${t.slug}`));
  const complianceTools: ComplianceToolMeta[] = enabledCompliance.map((t) => ({
    slug: t.slug,
    name: t.toolName,
    description: t.description,
  }));

  return {
    accessibleFeatures,
    isSuperAdmin: isSuperAdmin(profile.userGroupIds),
    journeyTools,
    complianceTools,
  };
}
