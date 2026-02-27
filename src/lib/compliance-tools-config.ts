import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// Re-export everything from the types file so existing server-side imports still work
export type {
  ComplianceRequirementConfig,
  ComplianceMilestoneConfig,
  ComplianceToolConfig,
  ComplianceToolsConfig,
} from "./compliance-tools-config-types";
export {
  ComplianceToolsConfigSchema,
  validateComplianceToolConfig,
  generateSlug,
  generateUniqueSlug,
} from "./compliance-tools-config-types";

import type { ComplianceToolConfig, ComplianceToolsConfig } from "./compliance-tools-config-types";

const CONFIG_PATH = join(process.cwd(), "data", "compliance-tools.json");

// ---------------------------------------------------------------------------
// Config I/O (server-only — uses fs)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ComplianceToolsConfig = { tools: [] };

/**
 * Load compliance tools config from disk.
 * Returns an empty config if the file doesn't exist yet.
 */
export function loadComplianceToolsConfig(): ComplianceToolsConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG, tools: [] };
  }
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as ComplianceToolsConfig;
  if (!parsed.tools || !Array.isArray(parsed.tools)) {
    return { ...DEFAULT_CONFIG, tools: [] };
  }
  return parsed;
}

/**
 * Save compliance tools config to disk.
 * Creates the data directory if it doesn't exist.
 */
export function saveComplianceToolsConfig(config: ComplianceToolsConfig): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Query helpers (server-only — depend on loadComplianceToolsConfig)
// ---------------------------------------------------------------------------

/** Returns only enabled compliance tool configs. */
export function getEnabledComplianceTools(): ComplianceToolConfig[] {
  const config = loadComplianceToolsConfig();
  return config.tools.filter((t) => t.enabled);
}

/** Find a compliance tool by its URL slug. Returns null if not found. */
export function getComplianceToolBySlug(slug: string): ComplianceToolConfig | null {
  const config = loadComplianceToolsConfig();
  return config.tools.find((t) => t.slug === slug) ?? null;
}
