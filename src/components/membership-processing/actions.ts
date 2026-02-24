"use server";

import { requireSession, getMpUserId } from "@/lib/auth-helpers";
import { MembershipService } from "@/services/membershipService";
import { MembershipCard, MembershipDetail, MembershipMilestoneFileInfo } from "@/lib/dto";

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
    const userId = getMpUserId(session);

    const service = await MembershipService.getInstance();
    const newMilestoneId = await service.createMilestone({
      Participant_ID: Number(formData.get("Participant_ID")),
      Milestone_ID: Number(formData.get("Milestone_ID")),
      Program_ID: Number(formData.get("Program_ID")),
      Date_Accomplished: formData.get("Date_Accomplished") as string || undefined,
      Notes: formData.get("Notes") as string || undefined,
    }, userId);

    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File && value.size > 0) {
        files.push(value);
      }
    }

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

    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "files" && value instanceof File && value.size > 0) {
        files.push(value);
      }
    }

    if (files.length > 0) {
      await service.uploadDocument('Participant_Milestones', milestoneRecordId, files, userId);
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
  try {
    const session = await requireSession();

    const contactId = Number(formData.get("Contact_ID"));
    if (!contactId || isNaN(contactId)) {
      return { success: false, error: "Invalid Contact_ID" };
    }

    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return { success: false, error: "No file provided" };
    }

    const MAX_FILE_SIZE = 1 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum 1 MB.` };
    }

    const userId = getMpUserId(session);

    const service = await MembershipService.getInstance();
    await service.uploadContactPhoto(contactId, file, userId);
    return { success: true };
  } catch (error) {
    console.error("Error uploading applicant photo:", error);
    return { success: false, error: "Failed to upload photo" };
  }
}
