"use server";

import { getMpUserId } from "@/lib/auth-helpers";
import { requireFeatureAccess, type DynamicFeature } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { JourneyProcessingService } from "@/services/journeyProcessingService";
import { getJourneyToolBySlug } from "@/lib/journey-tools-config";
import type { JourneyCard, JourneyDetail, JourneyMilestoneFileInfo } from "@/lib/dto";
import { extractValidatedFiles, extractValidatedFilesResult, uploadContactPhoto } from "@/components/shared-actions/processing";

/** Validate slug and check feature access in one step. */
async function requireJourneyAccess(slug: string) {
  const config = getJourneyToolBySlug(slug);
  if (!config || !config.enabled) {
    throw new Error("Journey tool not found or disabled");
  }
  const session = await requireFeatureAccess(`journey:${slug}` as DynamicFeature);
  return { session, config };
}

export async function getJourneyParticipants(slug: string): Promise<JourneyCard[]> {
  try {
    await requireJourneyAccess(slug);
    const service = JourneyProcessingService.getInstance(slug);
    return await service.getParticipants();
  } catch (error) {
    console.error("Error fetching journey participants:", error);
    throw new Error("Failed to fetch participants");
  }
}

export async function getCompletedJourneyParticipants(slug: string): Promise<JourneyCard[]> {
  try {
    await requireJourneyAccess(slug);
    const service = JourneyProcessingService.getInstance(slug);
    return await service.getCompletedParticipants();
  } catch (error) {
    console.error("Error fetching completed journey participants:", error);
    throw new Error("Failed to fetch completed participants");
  }
}

export async function getPausedJourneyParticipants(slug: string): Promise<JourneyCard[]> {
  try {
    const { config } = await requireJourneyAccess(slug);
    if (!config.supportsPause || !config.pausedGroupId) return [];
    const service = JourneyProcessingService.getInstance(slug);
    return await service.getPausedParticipants();
  } catch (error) {
    console.error("Error fetching paused journey participants:", error);
    throw new Error("Failed to fetch paused participants");
  }
}

export async function getJourneyParticipantDetail(
  slug: string,
  contactId: number,
  participantId: number,
  groupParticipantId: number | null
): Promise<JourneyDetail | null> {
  try {
    await requireJourneyAccess(slug);
    const service = JourneyProcessingService.getInstance(slug);
    return await service.getParticipantDetail(contactId, participantId, groupParticipantId);
  } catch (error) {
    console.error("Error fetching journey participant detail:", error);
    throw new Error("Failed to fetch participant detail");
  }
}

export async function createJourneyMilestone(slug: string, formData: FormData): Promise<void> {
  try {
    const { session } = await requireJourneyAccess(slug);
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    const service = JourneyProcessingService.getInstance(slug);
    const newMilestoneId = await service.createMilestone({
      Participant_ID: Number(formData.get("Participant_ID")),
      Milestone_ID: Number(formData.get("Milestone_ID")),
      Program_ID: Number(formData.get("Program_ID")),
      Date_Accomplished: formData.get("Date_Accomplished") as string || undefined,
      Notes: formData.get("Notes") as string || undefined,
    }, userId);

    const files = await extractValidatedFiles(formData);

    if (files.length > 0) {
      await service.uploadDocument('Participant_Milestones', newMilestoneId, files, userId);
    }
  } catch (error) {
    console.error("Error creating journey milestone:", error);
    throw new Error("Failed to create milestone");
  }
}

export async function updateJourneyMilestone(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { session } = await requireJourneyAccess(slug);
    enforceRateLimit(session.user.id, "write");

    const milestoneRecordId = Number(formData.get("Participant_Milestone_ID"));
    if (!milestoneRecordId || isNaN(milestoneRecordId)) {
      return { success: false, error: "Invalid milestone record ID" };
    }

    const userId = getMpUserId(session);

    const service = JourneyProcessingService.getInstance(slug);
    await service.updateMilestone({
      Participant_Milestone_ID: milestoneRecordId,
      Date_Accomplished: formData.get("Date_Accomplished") as string || undefined,
      Notes: formData.get("Notes") as string || undefined,
    }, userId);

    const result = await extractValidatedFilesResult(formData);
    if ("error" in result) return { success: false, error: result.error };

    if (result.files.length > 0) {
      await service.uploadDocument('Participant_Milestones', milestoneRecordId, result.files, userId);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating journey milestone:", error);
    return { success: false, error: "Failed to update milestone" };
  }
}

export async function getJourneyMilestoneFiles(slug: string, milestoneRecordId: number): Promise<JourneyMilestoneFileInfo[]> {
  try {
    await requireJourneyAccess(slug);
    const service = JourneyProcessingService.getInstance(slug);
    return await service.getMilestoneFiles(milestoneRecordId);
  } catch (error) {
    console.error("Error fetching journey milestone files:", error);
    throw new Error("Failed to fetch milestone files");
  }
}

export async function uploadJourneyParticipantPhoto(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireJourneyAccess(slug);
  return uploadContactPhoto(formData, async () => JourneyProcessingService.getInstance(slug));
}

export async function completeJourneyParticipant(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { session, config } = await requireJourneyAccess(slug);
    enforceRateLimit(session.user.id, "write");

    if (!config.trackingGroupId) {
      return { success: false, error: "Complete requires a tracking group" };
    }

    const currentGroupParticipantId = Number(formData.get("Group_Participant_ID"));
    if (!currentGroupParticipantId) {
      return { success: false, error: "Missing required fields" };
    }

    const userId = getMpUserId(session);
    const service = JourneyProcessingService.getInstance(slug);
    await service.completeParticipant({
      currentGroupParticipantId,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error completing journey participant:", error);
    return { success: false, error: "Failed to complete participant" };
  }
}

export async function pauseJourneyParticipant(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { session, config } = await requireJourneyAccess(slug);
    enforceRateLimit(session.user.id, "write");

    if (!config.trackingGroupId) {
      return { success: false, error: "Pause/resume requires a tracking group" };
    }

    const participantId = Number(formData.get("Participant_ID"));
    const currentGroupParticipantId = Number(formData.get("Group_Participant_ID"));
    const notes = formData.get("Notes") as string || undefined;

    if (!participantId || !currentGroupParticipantId) {
      return { success: false, error: "Missing required fields" };
    }

    const userId = getMpUserId(session);

    const service = JourneyProcessingService.getInstance(slug);
    await service.pauseParticipant({
      participantId,
      currentGroupParticipantId,
      notes,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error pausing journey participant:", error);
    return { success: false, error: "Failed to pause participant" };
  }
}

export async function resumeJourneyParticipant(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { session, config } = await requireJourneyAccess(slug);
    enforceRateLimit(session.user.id, "write");

    if (!config.trackingGroupId) {
      return { success: false, error: "Pause/resume requires a tracking group" };
    }

    const participantId = Number(formData.get("Participant_ID"));
    const currentGroupParticipantId = Number(formData.get("Group_Participant_ID"));

    if (!participantId || !currentGroupParticipantId) {
      return { success: false, error: "Missing required fields" };
    }

    const userId = getMpUserId(session);

    const service = JourneyProcessingService.getInstance(slug);
    await service.resumeParticipant({
      participantId,
      currentGroupParticipantId,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error resuming journey participant:", error);
    return { success: false, error: "Failed to resume participant" };
  }
}
