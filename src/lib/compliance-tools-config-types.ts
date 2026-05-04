import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceRequirementConfig {
  requirementId: number;
  label: string;
  type: 'background_check' | 'certification' | 'milestone' | 'form';
  sortOrder: number;
  visible: boolean;
}

export interface ComplianceMilestoneConfig {
  milestoneId: number;
  label: string;
  sortOrder: number;
  visible: boolean;
  /** When true, creating this participant milestone in MP sets Discontinue_Journey = 1. */
  discontinuesJourney?: boolean;
  /** Badge shown when this milestone discontinues the journey.
   *  "discontinued" (default) = red badge, "completed" = green badge. */
  completionBadge?: "discontinued" | "completed";
}

export interface ComplianceToolConfig {
  slug: string;
  toolName: string;
  description: string;
  enabled: boolean;
  groupRoleIds: number[];
  journeyId: number | null;
  journeyMilestones: ComplianceMilestoneConfig[];
  requirements: ComplianceRequirementConfig[];
  programId: number | null;
  trackingGroupId: number | null;
  defaultGroupRoleId: number | null;
  supportsPause: boolean;
  pausedGroupId: number | null;
  pauseMilestoneId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceToolsConfig {
  tools: ComplianceToolConfig[];
}

// ---------------------------------------------------------------------------
// Zod Validation Schemas
// ---------------------------------------------------------------------------

const ComplianceRequirementConfigSchema = z.object({
  requirementId: z.number().int().nonnegative(), // 0 = generic "Background Check Required" (no specific type)
  label: z.string().min(1).max(200),
  type: z.enum(['background_check', 'certification', 'milestone', 'form']),
  sortOrder: z.number().int().min(0),
  visible: z.boolean(),
});

const ComplianceMilestoneConfigSchema = z.object({
  milestoneId: z.number().int().positive(),
  label: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0),
  visible: z.boolean(),
  discontinuesJourney: z.boolean().optional(),
  completionBadge: z.enum(["discontinued", "completed"]).optional(),
});

const ComplianceToolConfigSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
    toolName: z.string().min(1).max(100),
    description: z.string().max(500),
    enabled: z.boolean(),
    groupRoleIds: z.array(z.number().int().positive()),
    journeyId: z.number().int().positive().nullable(),
    journeyMilestones: z.array(ComplianceMilestoneConfigSchema),
    requirements: z.array(ComplianceRequirementConfigSchema),
    programId: z.number().int().positive().nullable(),
    trackingGroupId: z.number().int().positive().nullable(),
    defaultGroupRoleId: z.number().int().positive().nullable(),
    supportsPause: z.boolean(),
    pausedGroupId: z.number().int().positive().nullable(),
    pauseMilestoneId: z.number().int().positive().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .refine(
    (cfg) => !(cfg.journeyId || cfg.journeyMilestones.length > 0) || cfg.programId !== null,
    {
      // Without a Program_ID, journey milestones can't be saved to MP — the Mark Complete button stays disabled.
      message: "Program is required when a journey is attached",
      path: ["programId"],
    },
  );

export const ComplianceToolsConfigSchema = z.object({
  tools: z.array(ComplianceToolConfigSchema),
});

/** Validate a single compliance tool config. Returns parsed data or throws. */
export function validateComplianceToolConfig(data: unknown): ComplianceToolConfig {
  return ComplianceToolConfigSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Pure helpers (no fs dependency — safe for client components)
// ---------------------------------------------------------------------------

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateUniqueSlug(name: string, existingSlugs: string[]): string {
  const base = generateSlug(name);
  if (!existingSlugs.includes(base)) return base;
  let i = 2;
  while (existingSlugs.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
