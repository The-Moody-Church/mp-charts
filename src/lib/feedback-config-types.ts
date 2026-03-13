import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeedbackConfig {
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Zod Validation Schema
// ---------------------------------------------------------------------------

export const FeedbackConfigSchema = z.object({
  enabled: z.boolean(),
});

export function validateFeedbackConfig(data: unknown): FeedbackConfig {
  return FeedbackConfigSchema.parse(data);
}
