import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeedbackConfig {
  enabled: boolean;
  feedbackTypeId: number | null;
  assignedToContactId: number | null;
}

// ---------------------------------------------------------------------------
// Zod Validation Schema
// ---------------------------------------------------------------------------

export const FeedbackConfigSchema = z.object({
  enabled: z.boolean(),
  feedbackTypeId: z.number().int().positive().nullable(),
  assignedToContactId: z.number().int().positive().nullable(),
});

export function validateFeedbackConfig(data: unknown): FeedbackConfig {
  return FeedbackConfigSchema.parse(data);
}
