'use server';

import { mpUserProfile } from "@/providers/MinistryPlatform/Interfaces/mpUserProfile";
import { UserService } from '@/services/userService';

export async function getCurrentUserProfile(id:string): Promise<mpUserProfile> {
  console.log('getCurrentUserProfile');
  console.log(id);
  const userService = await UserService.getInstance();
  const userProfile = await userService.getUserProfile(id);
  console.log(userProfile);
  return userProfile;
}