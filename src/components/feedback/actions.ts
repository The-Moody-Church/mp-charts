"use server";

import { requireSession } from "@/lib/auth-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isFeedbackEnabled } from "@/lib/feedback-config";
import { FeedbackService } from "@/services/feedbackService";

export async function submitFeedback(
  title: string,
  description: string,
  pageUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    enforceRateLimit(session.user.id, "write");

    if (!isFeedbackEnabled()) {
      return { success: false, error: "Feedback is not enabled." };
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      return { success: false, error: "Title is required." };
    }
    if (trimmedTitle.length > 50) {
      return { success: false, error: "Title must be 50 characters or less." };
    }
    if (trimmedDescription.length > 2000) {
      return { success: false, error: "Description must be 2000 characters or less." };
    }

    const userName = session.user.name || "Unknown User";

    const feedbackService = FeedbackService.getInstance();
    await feedbackService.createFeedbackIssue({
      title: trimmedTitle,
      description: trimmedDescription || null,
      pageUrl,
      userName,
    });

    return { success: true };
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return {
      success: false,
      error: "Failed to submit feedback. Please try again later.",
    };
  }
}
