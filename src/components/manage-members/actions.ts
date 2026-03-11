'use server';

import { requireFeatureAccess } from "@/lib/authorization";
import { getMpUserId } from "@/lib/auth-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MemberService } from "@/services/memberService";
import { ALLOWED_DOCUMENT_TYPES, MAX_FILE_SIZE } from "@/lib/processing-utils";
import type { MemberCard, TransitionPayload } from "@/lib/dto";

export async function fetchMembers(
  statusIds: number[],
  page: number,
  search?: string,
): Promise<{ members: MemberCard[] }> {
  const session = await requireFeatureAccess("manage-members");
  enforceRateLimit(session.user.id, "search");

  const service = await MemberService.getInstance();
  const skip = (page - 1) * 50;
  const result = await service.getMembers({
    statusIds,
    top: 50,
    skip,
    search: search || undefined,
  });

  return { members: result.members };
}

export async function fetchStatusCounts(
  search?: string,
): Promise<Record<string, number>> {
  const session = await requireFeatureAccess("manage-members");
  enforceRateLimit(session.user.id, "search");

  const service = await MemberService.getInstance();
  return service.getStatusCounts(search || undefined);
}

export async function fetchMemberStatuses(): Promise<
  { Member_Status_ID: number; Member_Status: string }[]
> {
  await requireFeatureAccess("manage-members");
  const service = await MemberService.getInstance();
  return service.getMemberStatuses();
}

export async function transitionMember(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireFeatureAccess("manage-members");
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    const contactId = Number(formData.get("contactId"));
    const participantId = Number(formData.get("participantId"));
    const newStatusId = Number(formData.get("newStatusId"));
    const milestoneDate = String(formData.get("milestoneDate") || "");
    const notes = String(formData.get("notes") || "");

    if (!contactId || isNaN(contactId)) {
      return { success: false, error: "Invalid Contact ID" };
    }
    if (!participantId || isNaN(participantId)) {
      return { success: false, error: "Invalid Participant ID" };
    }
    if (!newStatusId || isNaN(newStatusId)) {
      return { success: false, error: "Invalid status ID" };
    }
    if (!milestoneDate) {
      return { success: false, error: "Milestone date is required" };
    }

    // Validate file if provided
    const file = formData.get("attachment");
    let validFile: File | null = null;
    if (file instanceof File && file.size > 0) {
      if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
        return {
          success: false,
          error: `Invalid file type: ${file.type}. Allowed: JPEG, PNG, GIF, WebP, PDF`,
        };
      }
      if (file.size > MAX_FILE_SIZE) {
        return { success: false, error: "File too large. Maximum 1 MB." };
      }
      validFile = file;
    }

    const service = await MemberService.getInstance();

    // Fetch statuses for dropped note prefixing
    const statuses = await service.getMemberStatuses();

    const payload: TransitionPayload = {
      contactId,
      participantId,
      newStatusId,
      milestoneDate,
      notes: notes || undefined,
    };

    // Step 1: Create milestone
    const milestoneId = await service.addMilestone(payload, participantId, statuses, userId);

    // Step 2: Upload attachment if provided
    if (validFile) {
      try {
        await service.attachFileToMilestone(milestoneId, validFile, userId);
      } catch (error) {
        console.error("Error uploading milestone attachment:", error);
        // Continue — milestone was created, status update should still happen
      }
    }

    // Step 3: Update participant status
    await service.updateMemberStatus(participantId, newStatusId, userId);

    return { success: true };
  } catch (error) {
    console.error("Error transitioning member:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to transition member",
    };
  }
}
