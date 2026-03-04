import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { type Session } from "@/lib/auth";
import { requireSession, getUserGuid } from "@/lib/auth-helpers";
import { UserService } from "@/services/userService";
import { getEnabledJourneyTools } from "@/lib/journey-tools-config";
import { getEnabledComplianceTools } from "@/lib/compliance-tools-config";

const CONFIG_PATH = join(process.cwd(), "data", "feature-access.json");

export type StaticFeature =
  | "dashboard"
  | "baptism-processing"
  | "membership-processing"
  | "contact-lookup"
  | "contact-logs"
  | "admin";

/** Dynamic features follow the pattern "journey:{slug}" or "compliance:{slug}" */
export type DynamicFeature = `journey:${string}` | `compliance:${string}`;

export type Feature = StaticFeature | DynamicFeature;

export interface FeatureConfig {
  label: string;
  description: string;
  allowedGroupIds: number[];
}

export type FeatureAccessConfig = Record<string, FeatureConfig>;

const DEFAULT_CONFIG: FeatureAccessConfig = {
  "dashboard": {
    label: "Executive Dashboard",
    description: "View ministry metrics and attendance data",
    allowedGroupIds: [],
  },
  "baptism-processing": {
    label: "Baptism Processing",
    description: "Manage baptism applicants and milestones",
    allowedGroupIds: [],
  },
  "membership-processing": {
    label: "Membership Processing",
    description: "Manage membership applications",
    allowedGroupIds: [],
  },
  "contact-lookup": {
    label: "Contact Lookup",
    description: "Search and view contact records",
    allowedGroupIds: [],
  },
  "contact-logs": {
    label: "Contact Logs",
    description: "Create and manage pastoral contact logs",
    allowedGroupIds: [],
  },
};

/**
 * Parse ADMIN_USER_GROUP_IDS from .env (comma-separated).
 * Users in ANY of these groups are super-admins with full access.
 */
export function getAdminGroupIds(): number[] {
  const raw = process.env.ADMIN_USER_GROUP_IDS || "";
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Check if a user is a super-admin based on their User Group IDs.
 */
export function isSuperAdmin(userGroupIds: number[]): boolean {
  const adminIds = getAdminGroupIds();
  if (adminIds.length === 0) return false;
  return userGroupIds.some((id) => adminIds.includes(id));
}

/**
 * Load feature access config from disk.
 * Returns the default config if the file doesn't exist yet.
 */
export function loadFeatureAccess(): FeatureAccessConfig {
  const merged = { ...DEFAULT_CONFIG };

  if (existsSync(CONFIG_PATH)) {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as FeatureAccessConfig;

    // Merge with defaults to ensure new features are always present
    for (const [key, value] of Object.entries(parsed)) {
      merged[key] = value;
    }
  }

  // Inject enabled journey tools as dynamic features
  const journeyTools = getEnabledJourneyTools();
  for (const tool of journeyTools) {
    const featureKey = `journey:${tool.slug}`;
    if (!merged[featureKey]) {
      merged[featureKey] = {
        label: tool.journeyName,
        description: tool.description,
        allowedGroupIds: [],
      };
    }
  }

  // Inject enabled compliance tools as dynamic features
  const complianceTools = getEnabledComplianceTools();
  for (const tool of complianceTools) {
    const featureKey = `compliance:${tool.slug}`;
    if (!merged[featureKey]) {
      merged[featureKey] = {
        label: tool.toolName,
        description: tool.description,
        allowedGroupIds: [],
      };
    }
  }

  return merged;
}

/**
 * Save feature access config to disk.
 * Creates the data directory if it doesn't exist.
 */
export function saveFeatureAccess(config: FeatureAccessConfig): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * Check if a user can access a specific feature.
 *
 * - Super-admins (ADMIN_USER_GROUP_IDS) can access everything
 * - The "admin" feature is super-admin only (not in the config file)
 * - Other features check the config file's allowedGroupIds
 */
export function hasFeatureAccess(
  userGroupIds: number[],
  feature: Feature
): boolean {
  if (isSuperAdmin(userGroupIds)) return true;
  if (feature === "admin") return false;

  const config = loadFeatureAccess();
  const featureConfig = config[feature];
  if (!featureConfig) return false;

  return userGroupIds.some((id) => featureConfig.allowedGroupIds.includes(id));
}

/**
 * Get the list of features a user can access.
 * Used by the client to gate UI elements.
 */
export function getAccessibleFeatures(userGroupIds: number[]): Feature[] {
  const staticFeatures: StaticFeature[] = [
    "dashboard",
    "baptism-processing",
    "membership-processing",
    "contact-lookup",
    "contact-logs",
    "admin",
  ];

  // Include dynamic journey features
  const journeyTools = getEnabledJourneyTools();
  const journeyFeatures: DynamicFeature[] = journeyTools.map(
    (t) => `journey:${t.slug}` as DynamicFeature
  );

  // Include dynamic compliance features
  const complianceTools = getEnabledComplianceTools();
  const complianceFeatures: DynamicFeature[] = complianceTools.map(
    (t) => `compliance:${t.slug}` as DynamicFeature
  );

  const allFeatures: Feature[] = [...staticFeatures, ...journeyFeatures, ...complianceFeatures];
  return allFeatures.filter((f) => hasFeatureAccess(userGroupIds, f));
}

/**
 * Server-side enforcement — requires the authenticated user to have access
 * to the specified feature. Throws if unauthorized.
 *
 * Calls requireSession() internally, so it also handles authentication
 * and general rate limiting.
 *
 * @param feature - The feature to check access for
 * @returns The authenticated session
 * @throws Error("Unauthorized") if no user GUID in session
 * @throws Error("Forbidden: insufficient permissions") if user lacks access
 */
export async function requireFeatureAccess(feature: Feature): Promise<Session> {
  const session = await requireSession();
  const userGuid = getUserGuid(session);
  if (!userGuid) throw new Error("Unauthorized");

  const userService = await UserService.getInstance();
  const profile = await userService.getUserProfile(userGuid);
  if (!profile || !hasFeatureAccess(profile.userGroupIds, feature)) {
    throw new Error("Forbidden: insufficient permissions");
  }
  return session;
}
