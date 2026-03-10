'use server';

import { requireFeatureAccess } from '@/lib/authorization';
import { ContactLookupDetails, ContactLogDisplay, HouseholdMember, ContactBadges } from '@/lib/dto';
import { ContactService } from '@/services/contactService';
import { ContactLogService } from '@/services/contactLogService';

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
    throw new Error('Failed to fetch contact details');
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

    // Transform to ContactLogDisplay with type information
    const logsWithTypes = await Promise.all(
      logs.map(async (log) => {
        let contactLogType: string | null = null;

        if (log.Contact_Log_Type_ID) {
          const types = await contactLogService.getContactLogTypes();
          const type = types.find(t => t.Contact_Log_Type_ID === log.Contact_Log_Type_ID);
          contactLogType = type?.Contact_Log_Type || null;
        }

        return {
          ...log,
          Contact_Log_Type: contactLogType,
        } as ContactLogDisplay;
      })
    );

    return logsWithTypes;
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

export async function getContactBadges(contactId: number): Promise<ContactBadges> {
  try {
    await requireFeatureAccess("contact-lookup");

    if (!contactId || contactId <= 0) {
      throw new Error('Valid contact ID is required');
    }

    const contactService = await ContactService.getInstance();
    return contactService.getContactBadges(contactId);
  } catch (error) {
    console.error('Error fetching contact badges:', error);
    return { membershipStatus: null, inGroup: false, serving: false };
  }
}
