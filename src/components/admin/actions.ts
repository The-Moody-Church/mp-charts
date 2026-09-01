"use server";

import { z } from "zod";
import { requireFeatureAccess, loadFeatureAccess, saveFeatureAccess, type FeatureAccessConfig } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { UserService } from "@/services/userService";

export interface UserGroupOption {
  User_Group_ID: number;
  User_Group_Name: string;
}

/**
 * Keys that must never be used as a feature name. `loadFeatureAccess()` returns
 * `{ ...DEFAULT_CONFIG }` — a prototype-bearing object — so `config["__proto__"]`
 * is truthy and slips past an `if (!config[feature])` guard. The assignment that
 * follows would then write an enumerable property onto `Object.prototype` for the
 * lifetime of the server process.
 */
const FORBIDDEN_FEATURE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * `allowedGroupIds` is only a TypeScript annotation at the call boundary, and the
 * value is written straight to disk. That file lives on a named Docker volume, so a
 * bad value survives both restart and redeploy; on reload `hasFeatureAccess()` calls
 * `.includes()` on it, and a non-array throws out of `getAccessibleFeatures()` for
 * every non-super-admin user. Validate before persisting.
 */
const AllowedGroupIdsSchema = z.array(z.number().int().positive()).max(500);

export async function getFeatureAccessConfig(): Promise<FeatureAccessConfig> {
  await requireFeatureAccess("admin");
  return loadFeatureAccess();
}

export async function updateFeatureAccess(
  feature: string,
  allowedGroupIds: number[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireFeatureAccess("admin");
    enforceRateLimit(session.user.id, "write");

    const config = loadFeatureAccess();

    // Use Object.hasOwn, not truthiness: `__proto__` and `constructor` resolve
    // through the prototype chain and would otherwise pass the guard below.
    if (FORBIDDEN_FEATURE_KEYS.has(feature) || !Object.hasOwn(config, feature)) {
      return { success: false, error: "Unknown feature" };
    }

    const parsed = AllowedGroupIdsSchema.safeParse(allowedGroupIds);
    if (!parsed.success) {
      return { success: false, error: "Invalid group IDs" };
    }

    config[feature].allowedGroupIds = parsed.data;
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
