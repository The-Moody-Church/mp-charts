"use server";

import { requireSession, getMpUserId } from "@/lib/auth-helpers";
import { BaptismService } from "@/services/baptismService";
import { BaptismCard, BaptismDetail, BaptismMilestoneFileInfo } from "@/lib/dto";

export async function getCurrentApplicants(): Promise<BaptismCard[]> {
  try {
    await requireSession();
    const service = await BaptismService.getInstance();
    return await service.getCurrentApplicants();
  } catch (error) {
    console.error("Error fetching current baptism applicants:", error);
    throw new Error("Failed to fetch current baptism applicants");
  }
}

export async function getPausedApplicants(): Promise<BaptismCard[]> {
  try {
    await requireSession();
    const service = await BaptismService.getInstance();
    return await service.getPausedApplicants();
  } catch (error) {
    console.error("Error fetching paused baptism applicants:", error);
    throw new Error("Failed to fetch paused baptism applicants");
  }
}

export async function getApplicantDetail(
  contactId: number,
  participantId: number,
  groupParticipantId: number
): Promise<BaptismDetail | null> {
  try {
    await requireSession();
    const service = await BaptismService.getInstance();
    return await service.getApplicantDetail(contactId, participantId, groupParticipantId);
  } catch (error) {
    console.error("Error fetching baptism applicant detail:", error);
    throw new Error("Failed to fetch baptism applicant detail");
  }
}

export async function createBaptismMilestone(formData: FormData): Promise<void> {
  try {
    const session = await requireSession();
    const userId = getMpUserId(session);

    const service = await BaptismService.getInstance();
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
    console.error("Error creating baptism milestone:", error);
    throw new Error("Failed to create milestone");
  }
}

export async function updateBaptismMilestone(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();

    const milestoneRecordId = Number(formData.get("Participant_Milestone_ID"));
    if (!milestoneRecordId || isNaN(milestoneRecordId)) {
      return { success: false, error: "Invalid milestone record ID" };
    }

    const userId = getMpUserId(session);

    const service = await BaptismService.getInstance();
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
    console.error("Error updating baptism milestone:", error);
    return { success: false, error: "Failed to update milestone" };
  }
}

export async function getBaptismMilestoneFiles(milestoneRecordId: number): Promise<BaptismMilestoneFileInfo[]> {
  try {
    await requireSession();
    const service = await BaptismService.getInstance();
    return await service.getMilestoneFiles(milestoneRecordId);
  } catch (error) {
    console.error("Error fetching baptism milestone files:", error);
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

    const service = await BaptismService.getInstance();
    await service.uploadContactPhoto(contactId, file, userId);
    return { success: true };
  } catch (error) {
    console.error("Error uploading applicant photo:", error);
    return { success: false, error: "Failed to upload photo" };
  }
}

export async function pauseApplicant(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();

    const participantId = Number(formData.get("Participant_ID"));
    const currentGroupParticipantId = Number(formData.get("Group_Participant_ID"));
    const notes = formData.get("Notes") as string || undefined;

    if (!participantId || !currentGroupParticipantId) {
      return { success: false, error: "Missing required fields" };
    }

    const userId = getMpUserId(session);

    const service = await BaptismService.getInstance();
    await service.pauseApplicant({
      participantId,
      currentGroupParticipantId,
      notes,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error pausing baptism applicant:", error);
    return { success: false, error: "Failed to pause applicant" };
  }
}

export async function resumeApplicant(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireSession();

    const participantId = Number(formData.get("Participant_ID"));
    const currentGroupParticipantId = Number(formData.get("Group_Participant_ID"));

    if (!participantId || !currentGroupParticipantId) {
      return { success: false, error: "Missing required fields" };
    }

    const userId = getMpUserId(session);

    const service = await BaptismService.getInstance();
    await service.resumeApplicant({
      participantId,
      currentGroupParticipantId,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error resuming baptism applicant:", error);
    return { success: false, error: "Failed to resume applicant" };
  }
}
