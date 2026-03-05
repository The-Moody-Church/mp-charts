"use server";

import { requireFeatureAccess } from "@/lib/authorization";
import {
  loadFeedbackConfig,
  saveFeedbackConfig,
  validateFeedbackConfig,
} from "@/lib/feedback-config";
import type { FeedbackConfig } from "@/lib/feedback-config";
import { MPHelper } from "@/lib/providers/ministry-platform";
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

    if (config.enabled && !config.feedbackTypeId) {
      return { success: false, error: "Feedback Type ID is required when feedback is enabled." };
    }

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

export async function getFeedbackTypes(): Promise<
  { Feedback_Type_ID: number; Feedback_Type: string }[]
> {
  await requireFeatureAccess("admin");
  const mp = new MPHelper();
  const records = await mp.getTableRecords<{
    Feedback_Type_ID: number;
    Feedback_Type: string;
  }>({
    table: "Feedback_Types",
    select: "Feedback_Type_ID,Feedback_Type",
    top: 100,
    orderBy: "Feedback_Type",
  });
  return records;
}
