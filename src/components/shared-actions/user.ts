'use server';

import { requireSession } from "@/lib/auth-helpers";
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
 * Fetches the current user's profile from Ministry Platform
 * @param id - The user's GUID
 * @returns The user's profile data
 */
export async function getCurrentUserProfile(id: string): Promise<MPUserProfile | undefined> {
  await requireSession();
  const userService = await UserService.getInstance();
  return userService.getUserProfile(id);
}

/**
 * Returns the list of features accessible to the current user,
 * along with whether they are a super-admin.
 * Called by UserProvider at login to populate client-side authorization context.
 */
export async function getUserAuthorization(id: string): Promise<{
  accessibleFeatures: Feature[];
  isSuperAdmin: boolean;
  journeyTools: JourneyToolMeta[];
  complianceTools: ComplianceToolMeta[];
  feedbackEnabled: boolean;
}> {
  await requireSession();
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
