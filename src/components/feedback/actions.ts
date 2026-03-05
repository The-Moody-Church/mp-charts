"use server";

import { requireSession, getMpUserId, getMpContactId } from "@/lib/auth-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { loadFeedbackConfig, isFeedbackEnabled } from "@/lib/feedback-config";
import { FeedbackService } from "@/services/feedbackService";

export async function submitFeedback(
  title: string,
  description: string
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

    const contactId = getMpContactId(session);
    if (!contactId) {
      return { success: false, error: "Could not determine your contact ID." };
    }

    const mpUserId = getMpUserId(session);
    if (!mpUserId) {
      return { success: false, error: "Could not determine your user ID." };
    }

    const config = loadFeedbackConfig();

    // Date submitted in Central Time
    const now = new Date();
    const centralDate = now.toLocaleString("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    // Convert "MM/DD/YYYY, HH:mm:ss" to ISO-like format for MP
    const [datePart, timePart] = centralDate.split(", ");
    const [month, day, year] = datePart.split("/");
    const dateSubmitted = `${year}-${month}-${day}T${timePart}`;

    const feedbackService = await FeedbackService.getInstance();
    await feedbackService.createFeedbackEntry(
      {
        Contact_ID: contactId,
        Entry_Title: trimmedTitle,
        Feedback_Type_ID: config.feedbackTypeId!,
        Date_Submitted: dateSubmitted,
        Visibility_Level_ID: 2,
        Description: trimmedDescription || null,
        Ongoing_Need: false,
        Assigned_To: config.assignedToContactId,
        Approved: false,
      },
      mpUserId
    );

    return { success: true };
  } catch (error) {
    console.error("Error submitting feedback:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to submit feedback.",
    };
  }
}
