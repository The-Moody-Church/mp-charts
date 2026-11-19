"use server";

import { ContactLogTypes } from "@/lib/providers/ministry-platform/models/ContactLogTypes";
import {
  ContactLogService,
  type ContactLogCreateInput,
  type ContactLogUpdateInput,
} from "@/services/contactLogService";
import { getMpUserId } from "@/lib/auth-helpers";
import { requireFeatureAccess } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { sanitizeId } from "@/lib/providers/ministry-platform/utils/filter-sanitize";
import { errorForLog } from "@/lib/log-safe";

export async function getContactLogTypes(): Promise<ContactLogTypes[]> {
  try {
    await requireFeatureAccess("contact-lookup");

    const contactLogService = await ContactLogService.getInstance();
    const types = await contactLogService.getContactLogTypes();

    return types;
  } catch (error) {
    console.error("Error fetching contact log types:", errorForLog(error));
    throw new Error("Failed to fetch contact log types");
  }
}

/**
 * Creates a contact log. Resolves to nothing: a Server Action's return value
 * is serialised to the browser whether or not the client reads it, and MP's
 * POST response is the whole Contact_Log row (Contact_ID, Made_By and the
 * link/flag fields). The form only needs to know it succeeded.
 */
export async function createContactLog(
  contactLogData: ContactLogCreateInput
): Promise<void> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    if (!userId) {
      throw new Error("Unable to determine user User_ID for audit logging");
    }

    if (!contactLogData.Contact_ID || !contactLogData.Contact_Date || !contactLogData.Notes) {
      throw new Error("Required fields are missing: Contact_ID, Contact_Date, and Notes are required");
    }

    // Made_By is NOT assembled here. Attribution has exactly one source: the
    // `madeBy` argument below, stamped inside the service (F4). Two layers
    // stamping it could drift, and a caller value could slip past whichever
    // was checked second.
    const contactLogService = await ContactLogService.getInstance();
    await contactLogService.createContactLog(contactLogData, userId);
  } catch (error) {
    console.error("Error creating contact log:", errorForLog(error));
    throw new Error("Failed to create contact log");
  }
}

/**
 * Updates a contact log the current user created. Resolves to nothing, for the
 * same reason as `createContactLog`: MP's PUT response is the whole row.
 */
export async function updateContactLog(
  contactLogId: number,
  contactLogData: ContactLogUpdateInput
): Promise<void> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    if (!userId) {
      throw new Error("Unable to determine user User_ID for audit logging");
    }

    // React Flight args are type-erased — a "number" can arrive as "1 OR 1=1".
    contactLogId = sanitizeId(contactLogId);

    // Verify the current user owns this contact log entry
    const contactLogService = await ContactLogService.getInstance();
    const existingLog = await contactLogService.getContactLogById(contactLogId);

    if (!existingLog) {
      throw new Error("Contact log not found");
    }

    if (existingLog.Made_By !== userId) {
      throw new Error("You can only edit contact logs that you created");
    }

    // Made_By is never sent on update — MP preserves the original author, and
    // the service's `.pick()` allowlist drops any caller-supplied Made_By,
    // Contact_ID or link field (F4).
    await contactLogService.updateContactLog(
      contactLogId,
      contactLogData,
      userId
    );
  } catch (error) {
    console.error("Error updating contact log:", errorForLog(error));
    if (error instanceof Error && error.message === "You can only edit contact logs that you created") {
      throw error;
    }
    throw new Error("Failed to update contact log");
  }
}

export async function getCurrentUserMpUserId(): Promise<number | null> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    const userId = getMpUserId(session);
    return userId ?? null;
  } catch {
    return null;
  }
}

export async function createAutoContactLog(
  contactId: number,
  contactLogTypeId: number,
  notes: string,
): Promise<boolean> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    if (!userId) {
      throw new Error("Unable to determine user User_ID for audit logging");
    }

    // React Flight args are type-erased — a "number" can arrive as a string.
    // These two come straight from client components
    // (contact-links.tsx, contact-lookup-details.tsx) and were previously
    // passed through unvalidated.
    contactId = sanitizeId(contactId);
    contactLogTypeId = sanitizeId(contactLogTypeId);

    const userName = session.user.name || "User";
    const personalizedNotes = notes.replace("User", userName);

    const contactLogService = await ContactLogService.getInstance();
    // No Made_By here — the service stamps it from the second argument (F4).
    await contactLogService.createContactLog(
      {
        Contact_ID: contactId,
        Contact_Log_Type_ID: contactLogTypeId,
        Notes: personalizedNotes,
        Contact_Date: new Date().toISOString(),
      },
      userId
    );
    return true;
  } catch (error) {
    // Fire-and-forget: log but don't throw — don't block the user's action
    console.error("Error creating auto contact log:", errorForLog(error));
    return false;
  }
}
