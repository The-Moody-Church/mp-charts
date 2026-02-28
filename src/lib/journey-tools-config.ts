import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Re-export everything from the types file so existing server-side imports still work
export type {
  JourneyMilestoneConfig,
  JourneyToolConfig,
  JourneyToolsConfig,
} from "./journey-tools-config-types";
export {
  JourneyToolsConfigSchema,
  validateJourneyToolConfig,
  generateSlug,
  generateUniqueSlug,
} from "./journey-tools-config-types";

import type { JourneyToolConfig, JourneyMilestoneConfig, JourneyToolsConfig } from "./journey-tools-config-types";

const CONFIG_PATH = join(process.cwd(), "data", "journey-tools.json");
const FEATURE_ACCESS_PATH = join(process.cwd(), "data", "feature-access.json");

// ---------------------------------------------------------------------------
// Config I/O (server-only — uses fs)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: JourneyToolsConfig = { journeys: [] };

/**
 * Load journey tools config from disk.
 * On first load, auto-migrates built-in tools (baptism, membership) from env vars.
 * Returns an empty config if the file doesn't exist yet.
 */
export function loadJourneyToolsConfig(): JourneyToolsConfig {
  let config: JourneyToolsConfig;
  if (!existsSync(CONFIG_PATH)) {
    config = { ...DEFAULT_CONFIG, journeys: [] };
  } else {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as JourneyToolsConfig;
    if (!parsed.journeys || !Array.isArray(parsed.journeys)) {
      config = { ...DEFAULT_CONFIG, journeys: [] };
    } else {
      config = parsed;
    }
  }
  ensureBuiltInJourneyTools(config);
  return config;
}

/**
 * Save journey tools config to disk.
 * Creates the data directory if it doesn't exist.
 */
export function saveJourneyToolsConfig(config: JourneyToolsConfig): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Query helpers (server-only — depend on loadJourneyToolsConfig)
// ---------------------------------------------------------------------------

/** Returns only enabled journey tool configs. */
export function getEnabledJourneyTools(): JourneyToolConfig[] {
  const config = loadJourneyToolsConfig();
  return config.journeys.filter((j) => j.enabled);
}

/** Find a journey tool by its URL slug. Returns null if not found. */
export function getJourneyToolBySlug(slug: string): JourneyToolConfig | null {
  const config = loadJourneyToolsConfig();
  return config.journeys.find((j) => j.slug === slug) ?? null;
}

// ---------------------------------------------------------------------------
// Built-in tool migration (baptism + membership from env vars)
// ---------------------------------------------------------------------------

function getEnvInt(key: string): number | null {
  const val = process.env[key];
  if (!val) return null;
  const num = Number(val.trim());
  return isNaN(num) || num <= 0 ? null : num;
}

interface BuiltInMilestone {
  envKey: string;
  label: string;
  sortOrder: number;
}

interface BuiltInToolDef {
  slug: string;
  journeyName: string;
  description: string;
  journeyIdEnv: string;
  programIdEnv: string;
  trackingGroupIdEnv: string;
  pausedGroupIdEnv: string | null;
  defaultGroupRoleIdEnv: string | null;
  pauseMilestoneIdEnv: string | null;
  supportsPause: boolean;
  milestones: BuiltInMilestone[];
  featureAccessSource: string;
}

const BUILT_IN_TOOLS: BuiltInToolDef[] = [
  {
    slug: "baptism",
    journeyName: "Baptism Processing",
    description: "Track baptism applicants through the baptism journey and manage milestones",
    journeyIdEnv: "BAPTISM_JOURNEY_ID",
    programIdEnv: "BAPTISM_PROGRAM_ID",
    trackingGroupIdEnv: "BAPTISM_CURRENT_GROUP_ID",
    pausedGroupIdEnv: "BAPTISM_PAUSED_GROUP_ID",
    defaultGroupRoleIdEnv: "BAPTISM_DEFAULT_GROUP_ROLE_ID",
    pauseMilestoneIdEnv: "BAPTISM_PAUSED_MILESTONE_ID",
    supportsPause: true,
    milestones: [
      { envKey: "BAPTISM_APPLICATION_MILESTONE_ID", label: "Application", sortOrder: 1 },
      { envKey: "BAPTISM_CONFIRMATION_EMAIL_MILESTONE_ID", label: "Confirmation Email Sent", sortOrder: 2 },
      { envKey: "BAPTISM_SCHEDULED_INTERVIEW_MILESTONE_ID", label: "Interview Scheduled", sortOrder: 3 },
      { envKey: "BAPTISM_COMPLETED_INTERVIEW_MILESTONE_ID", label: "Interview Completed", sortOrder: 4 },
      { envKey: "BAPTISM_APPROVED_MILESTONE_ID", label: "Approved for Baptism", sortOrder: 5 },
      { envKey: "BAPTISM_INFO_REQUEST_EMAIL_MILESTONE_ID", label: "Info Request Email Sent", sortOrder: 6 },
      { envKey: "BAPTISM_ITEMS_RECEIVED_MILESTONE_ID", label: "Baptism Items Received", sortOrder: 7 },
      { envKey: "BAPTISM_SCHEDULED_MILESTONE_ID", label: "Baptism Scheduled", sortOrder: 8 },
      { envKey: "BAPTISM_CAPSTONE_MILESTONE_ID", label: "Baptism", sortOrder: 9 },
    ],
    featureAccessSource: "baptism-processing",
  },
  {
    slug: "membership",
    journeyName: "Membership Processing",
    description: "Track membership application milestones and manage the approval process",
    journeyIdEnv: "MEMBERSHIP_JOURNEY_ID",
    programIdEnv: "MEMBERSHIP_PROGRAM_ID",
    trackingGroupIdEnv: "MEMBERSHIP_GROUP_ID",
    pausedGroupIdEnv: null,
    defaultGroupRoleIdEnv: "MEMBERSHIP_DEFAULT_GROUP_ROLE_ID",
    pauseMilestoneIdEnv: null,
    supportsPause: false,
    milestones: [
      { envKey: "MEMBERSHIP_PRE_APPLICATION_MILESTONE_ID", label: "Membership Pre-Application", sortOrder: 1 },
      { envKey: "MEMBERSHIP_APPLICATION_MILESTONE_ID", label: "Membership Application", sortOrder: 2 },
      { envKey: "MEMBERSHIP_STARTED_CLASS_MILESTONE_ID", label: "Started Membership Class", sortOrder: 3 },
      { envKey: "MEMBERSHIP_COMPLETED_CLASS_MILESTONE_ID", label: "Completed Membership Class", sortOrder: 4 },
      { envKey: "MEMBERSHIP_APPROVED_BY_LC_MILESTONE_ID", label: "Membership Approved by LC", sortOrder: 5 },
      { envKey: "MEMBERSHIP_LISTED_IN_BULLETIN_MILESTONE_ID", label: "Listed in Bulletin 2 Weeks", sortOrder: 6 },
      { envKey: "MEMBERSHIP_PRESENTED_TO_CONGREGATION_MILESTONE_ID", label: "Presented to Congregation", sortOrder: 7 },
      { envKey: "MEMBERSHIP_REGISTERED_MEMBER_MILESTONE_ID", label: "Registered Member", sortOrder: 8 },
    ],
    featureAccessSource: "membership-processing",
  },
];

/**
 * Auto-migrate built-in tools (baptism, membership) from environment variables.
 * Idempotent — skips tools whose slug already exists in config.
 * Also copies feature-access permissions from the old feature key to the new journey key.
 */
function ensureBuiltInJourneyTools(config: JourneyToolsConfig): void {
  let modified = false;

  for (const def of BUILT_IN_TOOLS) {
    if (config.journeys.some((j) => j.slug === def.slug)) continue;

    const journeyId = getEnvInt(def.journeyIdEnv);
    const programId = getEnvInt(def.programIdEnv);
    const trackingGroupId = getEnvInt(def.trackingGroupIdEnv);
    if (!journeyId || !programId || !trackingGroupId) continue;

    const milestones: JourneyMilestoneConfig[] = [];
    let allMilestonesPresent = true;
    for (const m of def.milestones) {
      const id = getEnvInt(m.envKey);
      if (!id) { allMilestonesPresent = false; break; }
      milestones.push({ milestoneId: id, label: m.label, sortOrder: m.sortOrder, visible: true });
    }
    if (!allMilestonesPresent) continue;

    const now = new Date().toISOString();
    const tool: JourneyToolConfig = {
      slug: def.slug,
      journeyId,
      journeyName: def.journeyName,
      description: def.description,
      enabled: true,
      milestones,
      programId,
      trackingGroupId,
      pausedGroupId: def.pausedGroupIdEnv ? getEnvInt(def.pausedGroupIdEnv) : null,
      defaultGroupRoleId: def.defaultGroupRoleIdEnv ? getEnvInt(def.defaultGroupRoleIdEnv) : null,
      supportsPause: def.supportsPause,
      pauseMilestoneId: def.pauseMilestoneIdEnv ? getEnvInt(def.pauseMilestoneIdEnv) : null,
      createdAt: now,
      updatedAt: now,
    };

    config.journeys.push(tool);
    modified = true;

    // Copy feature-access permissions (read/write directly to avoid circular import with authorization.ts)
    try {
      if (existsSync(FEATURE_ACCESS_PATH)) {
        const raw = readFileSync(FEATURE_ACCESS_PATH, "utf-8");
        const featureConfig = JSON.parse(raw) as Record<string, { label: string; description: string; allowedGroupIds: number[] }>;
        const newKey = `journey:${def.slug}`;
        if (!featureConfig[newKey] && featureConfig[def.featureAccessSource]) {
          const source = featureConfig[def.featureAccessSource];
          featureConfig[newKey] = {
            label: def.journeyName,
            description: def.description,
            allowedGroupIds: [...source.allowedGroupIds],
          };
          writeFileSync(FEATURE_ACCESS_PATH, JSON.stringify(featureConfig, null, 2) + "\n", "utf-8");
        }
      }
    } catch {
      // Non-fatal — feature access can be configured manually
    }
  }

  if (modified) {
    saveJourneyToolsConfig(config);
  }
}
