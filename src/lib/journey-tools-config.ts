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

import type { JourneyToolConfig, JourneyToolsConfig } from "./journey-tools-config-types";

const CONFIG_PATH = join(process.cwd(), "data", "journey-tools.json");

// ---------------------------------------------------------------------------
// Config I/O (server-only — uses fs)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: JourneyToolsConfig = { journeys: [] };

/**
 * Load journey tools config from disk.
 * Returns an empty config if the file doesn't exist yet.
 */
export function loadJourneyToolsConfig(): JourneyToolsConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG, journeys: [] };
  }
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as JourneyToolsConfig;
  if (!parsed.journeys || !Array.isArray(parsed.journeys)) {
    return { ...DEFAULT_CONFIG, journeys: [] };
  }
  return parsed;
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
