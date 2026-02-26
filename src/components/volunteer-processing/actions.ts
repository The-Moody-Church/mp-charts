"use server";

import { getMpUserId } from "@/lib/auth-helpers";
import { requireFeatureAccess } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { VolunteerService } from "@/services/volunteerService";
import { VolunteerCard, VolunteerDetail, MilestoneFileInfo, ApprovedVolunteersResult, GroupRoleOption, GroupFilterOption } from "@/lib/dto";
import { extractValidatedFiles, extractValidatedFilesResult, uploadContactPhoto } from "@/components/shared-actions/processing";

export async function getInProcessVolunteers(): Promise<VolunteerCard[]> {
  try {
    await requireFeatureAccess("volunteer-processing");
    const service = await VolunteerService.getInstance();
    return await service.getInProcessVolunteers();
  } catch (error) {
    console.error("Error fetching in-process volunteers:", error);
    throw new Error("Failed to fetch in-process volunteers");
  }
}

export async function getApprovedVolunteers(): Promise<ApprovedVolunteersResult> {
  try {
    await requireFeatureAccess("volunteer-processing");
    const service = await VolunteerService.getInstance();
    return await service.getApprovedVolunteers();
  } catch (error) {
    console.error("Error fetching approved volunteers:", error);
    throw new Error("Failed to fetch approved volunteers");
  }
}

export async function getVolunteerDetail(
  contactId: number,
  participantId: number,
  groupParticipantId: number
): Promise<VolunteerDetail | null> {
  try {
    await requireFeatureAccess("volunteer-processing");
    const service = await VolunteerService.getInstance();
    return await service.getVolunteerDetail(contactId, participantId, groupParticipantId);
  } catch (error) {
    console.error("Error fetching volunteer detail:", error);
    throw new Error("Failed to fetch volunteer detail");
  }
}

export async function getMilestoneFiles(milestoneRecordId: number): Promise<MilestoneFileInfo[]> {
  try {
    await requireFeatureAccess("volunteer-processing");
    const service = await VolunteerService.getInstance();
    return await service.getMilestoneFiles(milestoneRecordId);
  } catch (error) {
    console.error("Error fetching milestone files:", error);
    throw new Error("Failed to fetch milestone files");
  }
}

export async function getCertificationFiles(certificationRecordId: number): Promise<MilestoneFileInfo[]> {
  try {
    await requireFeatureAccess("volunteer-processing");
    const service = await VolunteerService.getInstance();
    return await service.getCertificationFiles(certificationRecordId);
  } catch (error) {
    console.error("Error fetching certification files:", error);
    throw new Error("Failed to fetch certification files");
  }
}

export async function getFormResponseFiles(formResponseId: number): Promise<MilestoneFileInfo[]> {
  try {
    await requireFeatureAccess("volunteer-processing");
    const service = await VolunteerService.getInstance();
    return await service.getFormResponseFiles(formResponseId);
  } catch (error) {
    console.error("Error fetching form response files:", error);
    throw new Error("Failed to fetch form response files");
  }
}

export async function createFormResponse(formData: FormData): Promise<void> {
  try {
    const session = await requireFeatureAccess("volunteer-processing");
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    const service = await VolunteerService.getInstance();
    const newFormResponseId = await service.createFormResponse({
      Form_ID: Number(formData.get("Form_ID")),
      Contact_ID: Number(formData.get("Contact_ID")),
      Response_Date: formData.get("Response_Date") as string || undefined,
    }, userId);

    const files = await extractValidatedFiles(formData);

    if (files.length > 0) {
      await service.uploadDocument('Form_Responses', newFormResponseId, files, userId);
    }
  } catch (error) {
    console.error("Error creating form response:", error);
    throw new Error("Failed to create form response");
  }
}

export async function uploadVolunteerPhoto(formData: FormData): Promise<{ success: boolean; error?: string }> {
  await requireFeatureAccess("volunteer-processing");
  return uploadContactPhoto(formData, () => VolunteerService.getInstance());
}

export async function createVolunteerMilestone(formData: FormData): Promise<void> {
  try {
    const session = await requireFeatureAccess("volunteer-processing");
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    const service = await VolunteerService.getInstance();
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
    console.error("Error creating volunteer milestone:", error);
    throw new Error("Failed to create milestone");
  }
}

export async function updateVolunteerMilestone(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireFeatureAccess("volunteer-processing");
    enforceRateLimit(session.user.id, "write");

    const milestoneRecordId = Number(formData.get("Participant_Milestone_ID"));
    if (!milestoneRecordId || isNaN(milestoneRecordId)) {
      return { success: false, error: "Invalid milestone record ID" };
    }

    const userId = getMpUserId(session);

    const service = await VolunteerService.getInstance();
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
    console.error("Error updating volunteer milestone:", error);
    return { success: false, error: "Failed to update milestone" };
  }
}

export async function updateVolunteerCertification(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireFeatureAccess("volunteer-processing");
    enforceRateLimit(session.user.id, "write");

    const certId = Number(formData.get("Participant_Certification_ID"));
    if (!certId || isNaN(certId)) {
      return { success: false, error: "Invalid certification record ID" };
    }

    const userId = getMpUserId(session);

    const service = await VolunteerService.getInstance();
    await service.updateCertification({
      Participant_Certification_ID: certId,
      Certification_Completed: formData.get("Certification_Completed") as string || undefined,
      Notes: formData.get("Notes") as string || undefined,
    }, userId);

    const result = await extractValidatedFilesResult(formData);
    if ("error" in result) return { success: false, error: result.error };

    if (result.files.length > 0) {
      await service.uploadDocument('Participant_Certifications', certId, result.files, userId);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating volunteer certification:", error);
    return { success: false, error: "Failed to update certification" };
  }
}

export async function updateVolunteerFormResponse(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireFeatureAccess("volunteer-processing");
    enforceRateLimit(session.user.id, "write");

    const frId = Number(formData.get("Form_Response_ID"));
    if (!frId || isNaN(frId)) {
      return { success: false, error: "Invalid form response record ID" };
    }

    const userId = getMpUserId(session);

    const service = await VolunteerService.getInstance();
    await service.updateFormResponse({
      Form_Response_ID: frId,
      Response_Date: formData.get("Response_Date") as string || undefined,
    }, userId);

    const result = await extractValidatedFilesResult(formData);
    if ("error" in result) return { success: false, error: result.error };

    if (result.files.length > 0) {
      await service.uploadDocument('Form_Responses', frId, result.files, userId);
    }

    return { success: true };
  } catch (error) {
    console.error("Error updating form response:", error);
    return { success: false, error: "Failed to update form response" };
  }
}

export async function getApprovedGroupRoles(): Promise<GroupRoleOption[]> {
  try {
    await requireFeatureAccess("volunteer-processing");
    const service = await VolunteerService.getInstance();
    return await service.getApprovedGroupRoles();
  } catch (error) {
    console.error("Error fetching approved group roles:", error);
    throw new Error("Failed to fetch group roles");
  }
}

export async function getApprovedGroupsList(): Promise<GroupFilterOption[]> {
  try {
    await requireFeatureAccess("volunteer-processing");
    const service = await VolunteerService.getInstance();
    return await service.getApprovedGroupsList();
  } catch (error) {
    console.error("Error fetching approved groups list:", error);
    throw new Error("Failed to fetch approved groups");
  }
}

export async function assignVolunteerToGroup(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireFeatureAccess("volunteer-processing");
    enforceRateLimit(session.user.id, "write");

    const currentGroupParticipantId = Number(formData.get("currentGroupParticipantId"));
    const participantId = Number(formData.get("participantId"));
    const targetGroupId = Number(formData.get("targetGroupId"));
    const targetRoleId = Number(formData.get("targetRoleId"));

    if (!currentGroupParticipantId || !participantId || !targetGroupId || !targetRoleId) {
      return { success: false, error: "Missing required fields" };
    }

    const userId = getMpUserId(session);

    const service = await VolunteerService.getInstance();
    await service.assignVolunteerToGroup({
      currentGroupParticipantId,
      participantId,
      targetGroupId,
      targetRoleId,
      userId,
    });

    return { success: true };
  } catch (error) {
    console.error("Error assigning volunteer to group:", error);
    return { success: false, error: "Failed to assign volunteer to group" };
  }
}
