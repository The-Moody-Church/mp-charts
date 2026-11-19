'use server';

import { requireFeatureAccess } from '@/lib/authorization';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ContactLookupDetails, ContactLogDisplay, ContactLogMadeBy, HouseholdMember, ContactBadges, ContactGroupMembership } from '@/lib/dto';
import { ContactService } from '@/services/contactService';
import { ContactLogService } from '@/services/contactLogService';
import { MPHelper } from '@/lib/providers/ministry-platform';
import { sanitizeId, sanitizeIds } from '@/lib/providers/ministry-platform/utils/filter-sanitize';
import { uploadContactPhoto } from '@/components/shared-actions/processing';
import { errorForLog } from '@/lib/log-safe';

export async function getContactDetails(guid: string): Promise<ContactLookupDetails> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "search"); // F9: PII reads use the stricter search tier

    if (!guid || guid.trim().length === 0) {
      throw new Error('GUID is required');
    }

    const contactService = await ContactService.getInstance();
    const contact = await contactService.getContactByGuid(guid.trim());

    if (!contact) {
      throw new Error('Contact not found');
    }

    return contact;
  } catch (error) {
    console.error('Error fetching contact details:', error);
    throw new Error(`Failed to fetch contact details: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getContactLogsByContactId(contactId: number): Promise<ContactLogDisplay[]> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "search"); // F9: PII reads use the stricter search tier

    // React Flight args are type-erased — a "number" can arrive as "1 OR 1=1".
    contactId = sanitizeId(contactId);

    const contactLogService = await ContactLogService.getInstance();
    const logs = await contactLogService.getContactLogsByContactId(contactId);

    // Collect unique Made_By user IDs and look up their contact info
    const uniqueUserIds = [...new Set(logs.map(l => l.Made_By).filter(id => id > 0))];
    const madeByMap = new Map<number, ContactLogMadeBy>();

    if (uniqueUserIds.length > 0) {
      try {
        const mp = new MPHelper();
        // Only the three name columns the UI renders (contact-logs.tsx), plus
        // User_ID to match each log's Made_By. No email, phone, Contact_ID or
        // image: the browser never shows them (upstream 710dfa8, adapted).
        const userRecords = await mp.getTableRecords<{
          User_ID: number;
          First_Name: string;
          Nickname: string | null;
          Last_Name: string;
        }>({
          table: "dp_Users",
          filter: `User_ID IN (${sanitizeIds(uniqueUserIds)})`,
          select: "User_ID,Contact_ID_TABLE.First_Name,Contact_ID_TABLE.Nickname,Contact_ID_TABLE.Last_Name",
        });

        for (const rec of userRecords) {
          madeByMap.set(rec.User_ID, {
            First_Name: rec.First_Name,
            Nickname: rec.Nickname,
            Last_Name: rec.Last_Name,
          });
        }
      } catch (err) {
        // Non-fatal: logs still display, just without "Made By" names
        console.error("Error fetching Made_By contact info:", errorForLog(err));
      }
    }

    // Get log types once (not per-log)
    const types = await contactLogService.getContactLogTypes();

    // Built field by field: only what contact-logs.tsx renders or needs.
    // Made_By stays (the owner-only Edit button compares it to the session's
    // User_ID). No spread of the MP row and no cast, so a column added to the
    // service's select never reaches the browser by accident (upstream
    // 710dfa8, adapted: upstream drops Made_By, our UI needs it).
    const logsWithDetails: ContactLogDisplay[] = logs.map((log) => {
      const logType = log.Contact_Log_Type_ID
        ? types.find(t => t.Contact_Log_Type_ID === log.Contact_Log_Type_ID)?.Contact_Log_Type ?? null
        : null;

      const madeByContact = madeByMap.get(log.Made_By);

      return {
        Contact_Log_ID: log.Contact_Log_ID,
        Contact_Date: log.Contact_Date,
        Notes: log.Notes,
        Contact_Log_Type: logType,
        Contact_Log_Type_ID: log.Contact_Log_Type_ID ?? null,
        Made_By: log.Made_By,
        MadeByContact: madeByContact ? [madeByContact] : undefined,
      };
    });

    return logsWithDetails;
  } catch (error) {
    console.error('Error fetching contact logs:', errorForLog(error));
    throw new Error('Failed to fetch contact logs');
  }
}

export async function getHouseholdMembers(householdId: number): Promise<HouseholdMember[]> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "search"); // F9: PII reads use the stricter search tier

    // React Flight args are type-erased — a "number" can arrive as "1 OR 1=1".
    householdId = sanitizeId(householdId);

    const contactService = await ContactService.getInstance();
    return contactService.getHouseholdMembers(householdId);
  } catch (error) {
    console.error('Error fetching household members:', error);
    throw new Error('Failed to fetch household members');
  }
}

export async function getContactBadges(contactId: number, householdPositionId?: number | null): Promise<ContactBadges> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "search"); // F9: PII reads use the stricter search tier

    // React Flight args are type-erased — a "number" can arrive as "1 OR 1=1".
    contactId = sanitizeId(contactId);

    const contactService = await ContactService.getInstance();
    return contactService.getContactBadges(contactId, householdPositionId);
  } catch (error) {
    console.error('Error fetching contact badges:', error);
    return { membershipStatus: null, membershipStatusId: null, membershipDate: null, inGroup: false, serving: false, lastActivity: null, ageGradeGroups: [] };
  }
}

export async function getContactGroups(contactId: number): Promise<ContactGroupMembership[]> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "search"); // F9: PII reads use the stricter search tier

    // React Flight args are type-erased — a "number" can arrive as "1 OR 1=1".
    contactId = sanitizeId(contactId);

    const contactService = await ContactService.getInstance();
    return contactService.getContactGroupMemberships(contactId);
  } catch (error) {
    console.error('Error fetching contact groups:', error);
    return [];
  }
}

export async function uploadContactLookupPhoto(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireFeatureAccess("contact-lookup");
  return uploadContactPhoto(formData, () => ContactService.getInstance());
}
