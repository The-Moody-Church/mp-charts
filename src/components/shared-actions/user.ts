'use server';

import { requireSession } from "@/lib/auth-helpers";
import { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { UserService } from '@/services/userService';

/**
 * Fetches the current user's profile from Ministry Platform
 * @param id - The user's GUID
 * @returns The user's profile data
 */
export async function getCurrentUserProfile(id: string): Promise<MPUserProfile> {
  await requireSession();
  const userService = await UserService.getInstance();
  const userProfile = await userService.getUserProfile(id);
  return userProfile;
}
