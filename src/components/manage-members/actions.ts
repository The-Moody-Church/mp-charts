'use server';

import { revalidateTag } from "next/cache";
import { requireFeatureAccess } from "@/lib/authorization";
import { getMpUserId } from "@/lib/auth-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MemberService } from "@/services/memberService";
import { ALLOWED_DOCUMENT_TYPES, MAX_FILE_SIZE, searchByNameFlat } from "@/lib/processing-utils";
import { getCachedAllContacts } from "@/components/contact-lookup/cached-contacts";
import { MEMBERS_PAGE_SIZE } from "@/lib/dto";
import { ContactService } from "@/services/contactService";
import { uploadContactPhoto } from "@/components/shared-actions/processing";
import type { MemberCard, MemberDetail, BaseFileInfo, ContactSearch, TransitionPayload } from "@/lib/dto";

/** Convert a cached ContactSearch row to a MemberCard. */
function toMemberCard(c: ContactSearch): MemberCard {
  return {
    contactId: c.Contact_ID,
    participantId: c.Participant_ID!,
    displayName: `${c.First_Name} ${c.Last_Name}`,
    nickname: c.Nickname || null,
    firstName: c.First_Name,
    lastName: c.Last_Name,
    email: c.Email_Address || null,
    mobilePhone: c.Mobile_Phone || null,
    memberStatusId: c.Member_Status_ID!,
    memberStatus: c.Member_Status!,
    contactStatusId: null,
    fileUniqueId: c.Image_GUID || null,
    dateJoined: c.Date_Joined || null,
  };
}

/** Get all members from the cached contacts dataset (filtered to those with membership). */
async function getAllMembers(): Promise<ContactSearch[]> {
  const allContacts = await getCachedAllContacts();
  return allContacts.filter(
    (c) => c.Participant_ID != null && c.Member_Status_ID != null,
  );
}

/**
 * Combined fetch: returns both the paginated member list and all tab counts
 * in a single server action call (one rate-limit hit instead of two).
 */
export async function fetchMembersAndCounts(
  statusIds: number[],
  page: number,
  search?: string,
): Promise<{ members: MemberCard[]; counts: Record<string, number> }> {
  const session = await requireFeatureAccess("manage-members");
  enforceRateLimit(session.user.id, "search");

  let allMembers = await getAllMembers();

  // Apply search using the same scored search as contact lookup
  if (search && search.trim()) {
    allMembers = searchByNameFlat(allMembers, search.trim());
  }

  // Compute counts across all statuses (before filtering by tab)
  const counts: Record<string, number> = {};
  for (const c of allMembers) {
    const key = String(c.Member_Status_ID);
    counts[key] = (counts[key] || 0) + 1;
  }

  // Filter by status tab
  const statusSet = new Set(statusIds);
  let tabMembers = allMembers.filter((c) => statusSet.has(c.Member_Status_ID!));

  // Sort by last name, first name (unless search already ranked them)
  if (!search || !search.trim()) {
    tabMembers.sort((a, b) => {
      const lastCmp = a.Last_Name.localeCompare(b.Last_Name);
      if (lastCmp !== 0) return lastCmp;
      return a.First_Name.localeCompare(b.First_Name);
    });
  }

  // Paginate
  const skip = (page - 1) * MEMBERS_PAGE_SIZE;
  const pageMembers = tabMembers.slice(skip, skip + MEMBERS_PAGE_SIZE);

  return { members: pageMembers.map(toMemberCard), counts };
}

export async function fetchMemberStatuses(): Promise<
  { Member_Status_ID: number; Member_Status: string }[]
> {
  await requireFeatureAccess("manage-members");
  const service = await MemberService.getInstance();
  return service.getMemberStatuses();
}

export async function fetchMemberDetail(
  contactId: number,
): Promise<MemberDetail | null> {
  const session = await requireFeatureAccess("manage-members");
  enforceRateLimit(session.user.id, "search");

  if (!contactId || isNaN(contactId)) {
    return null;
  }

  // Get member from cached contacts
  const allMembers = await getAllMembers();
  const contact = allMembers.find((c) => c.Contact_ID === contactId);
  if (!contact) return null;

  // Fetch milestones from DB
  const service = await MemberService.getInstance();
  const milestones = await service.getMemberMilestones(contact.Participant_ID!);

  return {
    member: toMemberCard(contact),
    milestones,
  };
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
        return { success: false, error: "File too large. Maximum 20 MB." };
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

    // No immediate cache invalidation — the client tracks transitions locally
    // and patches stale server data on search/tab-switch (see manage-members-shell.tsx).
    // The cache refreshes naturally on its 6h TTL or on server restart.

    return { success: true };
  } catch (error) {
    console.error("Error transitioning member:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to transition member",
    };
  }
}

export async function fetchMilestoneFiles(
  milestoneRecordId: number,
): Promise<BaseFileInfo[]> {
  const session = await requireFeatureAccess("manage-members");
  enforceRateLimit(session.user.id, "search");

  const service = await MemberService.getInstance();
  return service.getMilestoneFiles(milestoneRecordId);
}

export async function uploadMemberPhoto(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  await requireFeatureAccess("manage-members");
  return uploadContactPhoto(formData, () => ContactService.getInstance());
}

/** Force-refresh the contacts cache. Rate-limited to 5/hour. */
export async function refreshMemberCache(): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireFeatureAccess("manage-members");
    enforceRateLimit(session.user.id, "cacheRefresh");
    revalidateTag('contacts-search', { expire: 0 });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to refresh cache",
    };
  }
}
