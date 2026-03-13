"use server";

import { requireFeatureAccess } from "@/lib/authorization";
import {
  loadFeedbackConfig,
  saveFeedbackConfig,
  validateFeedbackConfig,
} from "@/lib/feedback-config";
import type { FeedbackConfig } from "@/lib/feedback-config";
import { z } from "zod";

export async function getFeedbackConfig(): Promise<FeedbackConfig> {
  await requireFeatureAccess("admin");
  return loadFeedbackConfig();
}

export async function saveFeedbackConfigAction(
  config: FeedbackConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireFeatureAccess("admin");
    validateFeedbackConfig(config);

    saveFeedbackConfig(config);
    return { success: true };
  } catch (error) {
    console.error("Error saving feedback config:", error);
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((i) => {
        const field = i.path.length > 0 ? i.path.join(".") : "config";
        return `${field}: ${i.message}`;
      });
      return { success: false, error: messages.join("; ") };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save feedback config.",
    };
  }
}

/**
 * Check whether the GITHUB_FEEDBACK_TOKEN env var is set.
 * Used by the admin UI to show configuration status.
 */
export async function getGitHubTokenConfigured(): Promise<boolean> {
  await requireFeatureAccess("admin");
  return !!process.env.GITHUB_FEEDBACK_TOKEN;
}
