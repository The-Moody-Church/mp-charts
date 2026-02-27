import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JourneyMilestoneConfig {
  milestoneId: number;
  label: string;
  sortOrder: number;
  visible: boolean;
}

export interface JourneyToolConfig {
  slug: string;
  journeyId: number;
  journeyName: string;
  description: string;
  enabled: boolean;
  milestones: JourneyMilestoneConfig[];
  programId: number | null;
  trackingGroupId: number | null;
  pausedGroupId: number | null;
  defaultGroupRoleId: number | null;
  supportsPause: boolean;
  pauseMilestoneId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyToolsConfig {
  journeys: JourneyToolConfig[];
}

// ---------------------------------------------------------------------------
// Zod Validation Schemas
// ---------------------------------------------------------------------------

const JourneyMilestoneConfigSchema = z.object({
  milestoneId: z.number().int().positive(),
  label: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0),
  visible: z.boolean(),
});

const JourneyToolConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  journeyId: z.number().int().positive(),
  journeyName: z.string().min(1).max(100),
  description: z.string().max(500),
  enabled: z.boolean(),
  milestones: z.array(JourneyMilestoneConfigSchema),
  programId: z.number().int().positive().nullable(),
  trackingGroupId: z.number().int().positive().nullable(),
  pausedGroupId: z.number().int().positive().nullable(),
  defaultGroupRoleId: z.number().int().positive().nullable(),
  supportsPause: z.boolean(),
  pauseMilestoneId: z.number().int().positive().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const JourneyToolsConfigSchema = z.object({
  journeys: z.array(JourneyToolConfigSchema),
});

/** Validate a single journey tool config. Returns parsed data or throws. */
export function validateJourneyToolConfig(data: unknown): JourneyToolConfig {
  return JourneyToolConfigSchema.parse(data);
}

// ---------------------------------------------------------------------------
// Pure helpers (no fs dependency — safe for client components)
// ---------------------------------------------------------------------------

/**
 * Generate a URL-safe slug from a journey name.
 * "Baptism Processing" → "baptism-processing"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate a unique slug, appending a numeric suffix if needed.
 */
export function generateUniqueSlug(name: string, existingSlugs: string[]): string {
  const base = generateSlug(name);
  if (!existingSlugs.includes(base)) return base;
  let i = 2;
  while (existingSlugs.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
