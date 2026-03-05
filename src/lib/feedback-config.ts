import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export type { FeedbackConfig } from "./feedback-config-types";
export {
  FeedbackConfigSchema,
  validateFeedbackConfig,
} from "./feedback-config-types";

import type { FeedbackConfig } from "./feedback-config-types";

const CONFIG_PATH = join(process.cwd(), "data", "feedback-config.json");

// ---------------------------------------------------------------------------
// Config I/O (server-only — uses fs)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: FeedbackConfig = {
  enabled: false,
  feedbackTypeId: null,
  assignedToContactId: null,
};

/**
 * Load feedback config from disk.
 * Returns a disabled default config if the file doesn't exist yet.
 */
export function loadFeedbackConfig(): FeedbackConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as FeedbackConfig;
  return { ...DEFAULT_CONFIG, ...parsed };
}

/**
 * Save feedback config to disk.
 * Creates the data directory if it doesn't exist.
 */
export function saveFeedbackConfig(config: FeedbackConfig): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/** Returns true if feedback is enabled and properly configured. */
export function isFeedbackEnabled(): boolean {
  const config = loadFeedbackConfig();
  return config.enabled && config.feedbackTypeId !== null;
}
