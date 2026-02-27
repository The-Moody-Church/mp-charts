"use server";

import { requireFeatureAccess, loadFeatureAccess, saveFeatureAccess, type FeatureAccessConfig } from "@/lib/authorization";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { UserService } from "@/services/userService";

export interface UserGroupOption {
  User_Group_ID: number;
  User_Group_Name: string;
}

export async function getFeatureAccessConfig(): Promise<FeatureAccessConfig> {
  await requireFeatureAccess("admin");
  return loadFeatureAccess();
}

export async function updateFeatureAccess(
  feature: string,
  allowedGroupIds: number[]
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireFeatureAccess("admin");

    const config = loadFeatureAccess();
    if (!config[feature]) {
      return { success: false, error: `Unknown feature: ${feature}` };
    }

    config[feature].allowedGroupIds = allowedGroupIds;
    saveFeatureAccess(config);

    return { success: true };
  } catch (error) {
    console.error("Error updating feature access:", error);
    return { success: false, error: "Failed to update feature access" };
  }
}

export async function getAvailableUserGroups(): Promise<UserGroupOption[]> {
  await requireFeatureAccess("admin");

  const mp = new MPHelper();
  const groups = await mp.getTableRecords<UserGroupOption>({
    table: "dp_User_Groups",
    select: "User_Group_ID, User_Group_Name",
    orderBy: "User_Group_Name",
  });

  return groups;
}

export async function flushProfileCaches(): Promise<{ success: boolean }> {
  await requireFeatureAccess("admin");
  UserService.flushProfileCache();
  return { success: true };
}
