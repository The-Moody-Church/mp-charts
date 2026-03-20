'use server';

import { requireFeatureAccess } from '@/lib/authorization';
import { ContactLookupDetails, ContactLogDisplay, ContactLogMadeBy, HouseholdMember, ContactBadges } from '@/lib/dto';
import { ContactService } from '@/services/contactService';
import { ContactLogService } from '@/services/contactLogService';
import { MPHelper } from '@/lib/providers/ministry-platform';
import { sanitizeIds } from '@/lib/providers/ministry-platform/utils/filter-sanitize';
import { uploadContactPhoto } from '@/components/shared-actions/processing';

export async function getContactDetails(guid: string): Promise<ContactLookupDetails> {
  try {
    await requireFeatureAccess("contact-lookup");

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
    await requireFeatureAccess("contact-lookup");

    if (!contactId || contactId <= 0) {
      throw new Error('Valid contact ID is required');
    }

    const contactLogService = await ContactLogService.getInstance();
    const logs = await contactLogService.getContactLogsByContactId(contactId);

    // Collect unique Made_By user IDs and look up their contact info
    const uniqueUserIds = [...new Set(logs.map(l => l.Made_By).filter(id => id > 0))];
    const madeByMap = new Map<number, ContactLogMadeBy>();

    if (uniqueUserIds.length > 0) {
      try {
        const mp = new MPHelper();
        const userRecords = await mp.getTableRecords<{
          User_ID: number;
          Contact_ID: number;
          First_Name: string;
          Last_Name: string;
          Nickname: string | null;
          Email_Address: string | null;
          Mobile_Phone: string | null;
          Image_GUID: string | null;
        }>({
          table: "dp_Users",
          filter: `User_ID IN (${sanitizeIds(uniqueUserIds)})`,
          select: "User_ID,Contact_ID_TABLE.Contact_ID,Contact_ID_TABLE.First_Name,Contact_ID_TABLE.Nickname,Contact_ID_TABLE.Last_Name,Contact_ID_TABLE.Email_Address,Contact_ID_TABLE.Mobile_Phone,Contact_ID_TABLE.dp_fileUniqueId AS Image_GUID",
        });

        for (const rec of userRecords) {
          madeByMap.set(rec.User_ID, {
            Contact_ID: rec.Contact_ID,
            First_Name: rec.First_Name,
            Last_Name: rec.Last_Name,
            Nickname: rec.Nickname,
            Email_Address: rec.Email_Address,
            Mobile_Phone: rec.Mobile_Phone,
            Image_GUID: rec.Image_GUID,
          });
        }
      } catch (err) {
        // Non-fatal: logs still display, just without "Made By" names
        console.error("Error fetching Made_By contact info:", err);
      }
    }

    // Get log types once (not per-log)
    const types = await contactLogService.getContactLogTypes();

    // Transform to ContactLogDisplay with type information and Made By contact
    const logsWithDetails: ContactLogDisplay[] = logs.map((log) => {
      const logType = log.Contact_Log_Type_ID
        ? types.find(t => t.Contact_Log_Type_ID === log.Contact_Log_Type_ID)?.Contact_Log_Type ?? null
        : null;

      const madeByContact = madeByMap.get(log.Made_By);

      return {
        ...log,
        Contact_Log_Type: logType,
        MadeByContact: madeByContact ? [madeByContact] : undefined,
      } as ContactLogDisplay;
    });

    return logsWithDetails;
  } catch (error) {
    console.error('Error fetching contact logs:', error);
    throw new Error('Failed to fetch contact logs');
  }
}

export async function getHouseholdMembers(householdId: number): Promise<HouseholdMember[]> {
  try {
    await requireFeatureAccess("contact-lookup");

    if (!householdId || householdId <= 0) {
      throw new Error('Valid household ID is required');
    }

    const contactService = await ContactService.getInstance();
    return contactService.getHouseholdMembers(householdId);
  } catch (error) {
    console.error('Error fetching household members:', error);
    throw new Error('Failed to fetch household members');
  }
}

export async function getContactBadges(contactId: number, householdPositionId?: number | null): Promise<ContactBadges> {
  try {
    await requireFeatureAccess("contact-lookup");

    if (!contactId || contactId <= 0) {
      throw new Error('Valid contact ID is required');
    }

    const contactService = await ContactService.getInstance();
    return contactService.getContactBadges(contactId, householdPositionId);
  } catch (error) {
    console.error('Error fetching contact badges:', error);
    return { membershipStatus: null, membershipStatusId: null, membershipDate: null, inGroup: false, serving: false, lastActivity: null, ageGradeGroups: [] };
  }
}

export async function uploadContactLookupPhoto(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  await requireFeatureAccess("contact-lookup");
  return uploadContactPhoto(formData, () => ContactService.getInstance());
}
