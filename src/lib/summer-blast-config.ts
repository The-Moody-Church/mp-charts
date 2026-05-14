import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummerBlastRequirementConfig {
  requirementId: number;
  label: string;
  type: "background_check" | "certification" | "form";
  sortOrder: number;
}

export interface SummerBlastRoleConfig {
  groupRoleId: number;
  label: string;
  requirements: SummerBlastRequirementConfig[];
}

export interface SummerBlastConfig {
  eventName: string;
  eventEndDate: string;
  intakeOpportunityId: number;
  trackingGroupId: number;
  tempGroupRoleId: number;
  cppFormId: number;
  mandatedReporterCertId: number;
  /** Group_ID for "Youth Assistant" — active membership = youth assistant form complete. */
  youthGroupId: number;
  /** Label used on the single checklist item shown to under-18 volunteers. */
  youthRequirementLabel: string;
  intakeRequirements: SummerBlastRequirementConfig[];
  roleConfigs: SummerBlastRoleConfig[];
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const RequirementSchema = z.object({
  requirementId: z.number().int().nonnegative(),
  label: z.string().min(1).max(200),
  type: z.enum(["background_check", "certification", "form"]),
  sortOrder: z.number().int().min(0),
});

const RoleConfigSchema = z.object({
  groupRoleId: z.number().int().positive(),
  label: z.string().min(1).max(200),
  requirements: z.array(RequirementSchema),
});

const SummerBlastConfigSchema = z.object({
  eventName: z.string().min(1),
  eventEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  intakeOpportunityId: z.number().int().positive(),
  trackingGroupId: z.number().int().positive(),
  tempGroupRoleId: z.number().int().positive(),
  cppFormId: z.number().int().positive(),
  mandatedReporterCertId: z.number().int().positive(),
  youthGroupId: z.number().int().positive(),
  youthRequirementLabel: z.string().min(1).max(200),
  intakeRequirements: z.array(RequirementSchema),
  roleConfigs: z.array(RoleConfigSchema),
});

// ---------------------------------------------------------------------------
// I/O (server-only)
// ---------------------------------------------------------------------------

const CONFIG_PATH = join(process.cwd(), "data", "summer-blast-config.json");

let cached: SummerBlastConfig | null = null;

export function getSummerBlastConfig(): SummerBlastConfig {
  if (cached) return cached;
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Summer Blast config not found at ${CONFIG_PATH}`);
  }
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  cached = SummerBlastConfigSchema.parse(parsed);
  return cached;
}

/** Resolve the requirements list for a given Group_Role_ID. Falls back to intakeRequirements. */
export function getRequirementsForRole(
  config: SummerBlastConfig,
  groupRoleId: number,
): SummerBlastRequirementConfig[] {
  const role = config.roleConfigs.find((r) => r.groupRoleId === groupRoleId);
  if (role && role.requirements.length > 0) return role.requirements;
  return config.intakeRequirements;
}

/** Label for a given Group_Role_ID. Returns null if not configured. */
export function getRoleLabel(config: SummerBlastConfig, groupRoleId: number): string | null {
  return config.roleConfigs.find((r) => r.groupRoleId === groupRoleId)?.label ?? null;
}
