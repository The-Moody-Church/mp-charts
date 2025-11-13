'use server';

import { ContactLookupDetails } from '@/lib/dto';
import { ContactService } from '@/services/contactService';

export async function getContactDetails(guid: string): Promise<ContactLookupDetails> {
  try {
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

type ContactUpdatableFields = Partial<Pick<ContactLookupDetails, "Email_Address" | "Mobile_Phone">>;

export async function updateContactEmailMobile(input: {
  contactId: number;
  Email_Address?: string | null;
  Mobile_Phone?: string | null;
}): Promise<{ ok: true }> {
  try {
    if (!input.contactId) {
      throw new Error("contactId is required");
    }

    const Email_Address = input.Email_Address?.trim() || null;
    const Mobile_Phone = input.Mobile_Phone?.trim() || null;

    if (Email_Address && !/^\S+@\S+\.\S+$/.test(Email_Address)) {
      throw new Error("Invalid email address");
    }

    const contactService = await ContactService.getInstance();
    const fields: ContactUpdatableFields = {};
    
    if (Email_Address !== undefined) fields.Email_Address = Email_Address;
    if (Mobile_Phone !== undefined) fields.Mobile_Phone = Mobile_Phone;

    await contactService.updateContact(input.contactId, fields);
    return { ok: true };
  } catch (error) {
    console.error("Error updating contact:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to update contact");
  }
}