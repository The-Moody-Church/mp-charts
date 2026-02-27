"use server";

import { getMpUserId } from "@/lib/auth-helpers";
import { requireFeatureAccess, type DynamicFeature } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ComplianceProcessingService } from "@/services/complianceProcessingService";
import { getComplianceToolBySlug } from "@/lib/compliance-tools-config";
import type { ComplianceCard, ComplianceDetail, ComplianceMilestoneFileInfo } from "@/lib/dto";
import { extractValidatedFiles, extractValidatedFilesResult, uploadContactPhoto } from "@/components/shared-actions/processing";

async function requireComplianceAccess(slug: string) {
  const config = getComplianceToolBySlug(slug);
  if (!config || !config.enabled) {
    throw new Error("Compliance tool not found or disabled");
  }
  const session = await requireFeatureAccess(`compliance:${slug}` as DynamicFeature);
  return { session, config };
}

export async function getComplianceParticipants(slug: string): Promise<ComplianceCard[]> {
  try {
    await requireComplianceAccess(slug);
    const service = ComplianceProcessingService.getInstance(slug);
    return await service.getParticipants();
  } catch (error) {
    console.error("Error fetching compliance participants:", error);
    throw new Error("Failed to fetch participants");
  }
}

export async function getPausedComplianceParticipants(slug: string): Promise<ComplianceCard[]> {
  try {
    const { config } = await requireComplianceAccess(slug);
    if (!config.supportsPause || !config.pausedGroupId) return [];
    const service = ComplianceProcessingService.getInstance(slug);
    return await service.getPausedParticipants();
  } catch (error) {
    console.error("Error fetching paused compliance participants:", error);
    throw new Error("Failed to fetch paused participants");
  }
}

export async function getComplianceParticipantDetail(
  slug: string,
  contactId: number,
  participantId: number,
  groupParticipantId: number
): Promise<ComplianceDetail | null> {
  try {
    await requireComplianceAccess(slug);
    const service = ComplianceProcessingService.getInstance(slug);
    return await service.getParticipantDetail(contactId, participantId, groupParticipantId);
  } catch (error) {
    console.error("Error fetching compliance participant detail:", error);
    throw new Error("Failed to fetch participant detail");
  }
}

export async function createComplianceMilestone(slug: string, formData: FormData): Promise<void> {
  try {
    const { session } = await requireComplianceAccess(slug);
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    const service = ComplianceProcessingService.getInstance(slug);
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
    console.error("Error creating compliance milestone:", error);
    throw new Error("Failed to create milestone");
  }
}

export async function updateComplianceMilestone(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { session } = await requireComplianceAccess(slug);
    enforceRateLimit(session.user.id, "write");

    const milestoneRecordId = Number(formData.get("Participant_Milestone_ID"));
    if (!milestoneRecordId || isNaN(milestoneRecordId)) {
      return { success: false, error: "Invalid milestone record ID" };
    }

    const userId = getMpUserId(session);

    const service = ComplianceProcessingService.getInstance(slug);
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
    console.error("Error updating compliance milestone:", error);
    return { success: false, error: "Failed to update milestone" };
  }
}

export async function getComplianceMilestoneFiles(slug: string, milestoneRecordId: number): Promise<ComplianceMilestoneFileInfo[]> {
  try {
    await requireComplianceAccess(slug);
    const service = ComplianceProcessingService.getInstance(slug);
    return await service.getMilestoneFiles(milestoneRecordId);
  } catch (error) {
    console.error("Error fetching compliance milestone files:", error);
    throw new Error("Failed to fetch milestone files");
  }
}

export async function uploadComplianceParticipantPhoto(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireComplianceAccess(slug);
  return uploadContactPhoto(formData, async () => ComplianceProcessingService.getInstance(slug));
}

export async function pauseComplianceParticipant(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { session } = await requireComplianceAccess(slug);
    enforceRateLimit(session.user.id, "write");

    const participantId = Number(formData.get("Participant_ID"));
    const currentGroupParticipantId = Number(formData.get("Group_Participant_ID"));
    const notes = formData.get("Notes") as string || undefined;

    if (!participantId || !currentGroupParticipantId) {
      return { success: false, error: "Missing required fields" };
    }

    const userId = getMpUserId(session);

    const service = ComplianceProcessingService.getInstance(slug);
    await service.pauseParticipant({
      participantId,
      currentGroupParticipantId,
      notes,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error pausing compliance participant:", error);
    return { success: false, error: "Failed to pause participant" };
  }
}

export async function resumeComplianceParticipant(slug: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { session } = await requireComplianceAccess(slug);
    enforceRateLimit(session.user.id, "write");

    const participantId = Number(formData.get("Participant_ID"));
    const currentGroupParticipantId = Number(formData.get("Group_Participant_ID"));

    if (!participantId || !currentGroupParticipantId) {
      return { success: false, error: "Missing required fields" };
    }

    const userId = getMpUserId(session);

    const service = ComplianceProcessingService.getInstance(slug);
    await service.resumeParticipant({
      participantId,
      currentGroupParticipantId,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error resuming compliance participant:", error);
    return { success: false, error: "Failed to resume participant" };
  }
}
