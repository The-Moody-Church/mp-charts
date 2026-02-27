'use server';

import { requireSession } from "@/lib/auth-helpers";
import { getAccessibleFeatures, isSuperAdmin, type Feature } from "@/lib/authorization";
import { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { UserService } from '@/services/userService';

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
}> {
  await requireSession();
  const userService = await UserService.getInstance();
  const profile = await userService.getUserProfile(id);
  if (!profile) {
    return { accessibleFeatures: [], isSuperAdmin: false };
  }
  return {
    accessibleFeatures: getAccessibleFeatures(profile.userGroupIds),
    isSuperAdmin: isSuperAdmin(profile.userGroupIds),
  };
}
