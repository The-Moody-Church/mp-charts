import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JourneyMilestoneConfig {
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

export interface JourneyToolConfig {
  slug: string;
  journeyId: number;
  journeyName: string;
  description: string;
  enabled: boolean;
  milestones: JourneyMilestoneConfig[];
  programId: number;
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
  discontinuesJourney: z.boolean().optional(),
  completionBadge: z.enum(["discontinued", "completed"]).optional(),
});

const JourneyToolConfigSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  journeyId: z.number().int().positive(),
  journeyName: z.string().min(1).max(100),
  description: z.string().max(500),
  enabled: z.boolean(),
  milestones: z.array(JourneyMilestoneConfigSchema),
  programId: z.number().int().positive(),
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

/**
 * The subset of Ministry Platform's milestone record this merge needs. Declared
 * structurally rather than importing MPMilestone from the admin actions module,
 * so this stays a dependency-free pure helper.
 */
export interface MilestoneSource {
  Milestone_ID: number;
  Milestone_Title: string;
  Sort_Order: number | null;
}

/**
 * Build the editor's milestone list for a journey from MP's current milestones.
 *
 * Entries already present in `saved` (matched on milestoneId) are returned
 * VERBATIM, so an admin's custom label, visibility, drag order,
 * discontinuesJourney and completionBadge all survive re-opening the editor.
 * Anything else gets MP's title and Sort_Order with `visible: true`. Milestones
 * MP no longer returns — the server action filters out Discontinued ones — drop
 * off the list.
 *
 * Pass an empty `saved` array to get pure defaults for a newly selected journey.
 */
export function mergeSavedMilestones(
  mpMilestones: MilestoneSource[],
  saved: JourneyMilestoneConfig[]
): JourneyMilestoneConfig[] {
  const savedById = new Map(saved.map((m) => [m.milestoneId, m]));
  return mpMilestones.map((m, idx) => {
    const existing = savedById.get(m.Milestone_ID);
    if (existing) return existing;
    return {
      milestoneId: m.Milestone_ID,
      label: m.Milestone_Title,
      sortOrder: m.Sort_Order ?? idx + 1,
      visible: true,
    };
  });
}
