"use server";

import { requireSession, getMpUserId } from "@/lib/auth-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MembershipService } from "@/services/membershipService";
import { MembershipCard, MembershipDetail, MembershipMilestoneFileInfo } from "@/lib/dto";
import { extractValidatedFiles, extractValidatedFilesResult, uploadContactPhoto } from "@/components/shared-actions/processing";

export async function getApplicants(): Promise<MembershipCard[]> {
  try {
    await requireSession();
    const service = await MembershipService.getInstance();
    return await service.getApplicants();
  } catch (error) {
    console.error("Error fetching membership applicants:", error);
    throw new Error("Failed to fetch membership applicants");
  }
}

export async function getApplicantDetail(
  contactId: number,
  participantId: number,
  groupParticipantId: number
): Promise<MembershipDetail | null> {
  try {
    await requireSession();
    const service = await MembershipService.getInstance();
    return await service.getApplicantDetail(contactId, participantId, groupParticipantId);
  } catch (error) {
    console.error("Error fetching membership applicant detail:", error);
    throw new Error("Failed to fetch membership applicant detail");
  }
}

export async function createMembershipMilestone(formData: FormData): Promise<void> {
  try {
    const session = await requireSession();
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    const service = await MembershipService.getInstance();
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
    console.error("Error creating membership milestone:", error);
    throw new Error("Failed to create milestone");
  }
}

export async function updateMembershipMilestone(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    enforceRateLimit(session.user.id, "write");

    const milestoneRecordId = Number(formData.get("Participant_Milestone_ID"));
    if (!milestoneRecordId || isNaN(milestoneRecordId)) {
      return { success: false, error: "Invalid milestone record ID" };
    }

    const userId = getMpUserId(session);

    const service = await MembershipService.getInstance();
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
    console.error("Error updating membership milestone:", error);
    return { success: false, error: "Failed to update milestone" };
  }
}

export async function confirmMembershipCompletion(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();
    enforceRateLimit(session.user.id, "write");

    const groupParticipantId = Number(formData.get("Group_Participant_ID"));
    if (!groupParticipantId || isNaN(groupParticipantId)) {
      return { success: false, error: "Missing Group_Participant_ID" };
    }

    const userId = getMpUserId(session);

    const service = await MembershipService.getInstance();
    await service.endGroupParticipation({
      groupParticipantId,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error confirming membership completion:", error);
    return { success: false, error: "Failed to confirm membership completion" };
  }
}

export async function getMembershipMilestoneFiles(milestoneRecordId: number): Promise<MembershipMilestoneFileInfo[]> {
  try {
    await requireSession();
    const service = await MembershipService.getInstance();
    return await service.getMilestoneFiles(milestoneRecordId);
  } catch (error) {
    console.error("Error fetching membership milestone files:", error);
    throw new Error("Failed to fetch milestone files");
  }
}

export async function uploadApplicantPhoto(formData: FormData): Promise<{ success: boolean; error?: string }> {
  return uploadContactPhoto(formData, () => MembershipService.getInstance());
}
