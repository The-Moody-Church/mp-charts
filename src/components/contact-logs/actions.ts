"use server";

import { ContactLog } from "@/lib/providers/ministry-platform/models/ContactLog";
import { ContactLogTypes } from "@/lib/providers/ministry-platform/models/ContactLogTypes";
import { ContactLogInput } from "@/lib/providers/ministry-platform/models/ContactLogSchema";
import { ContactLogService } from "@/services/contactLogService";
import { getMpUserId } from "@/lib/auth-helpers";
import { requireFeatureAccess } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function getContactLogTypes(): Promise<ContactLogTypes[]> {
  try {
    await requireFeatureAccess("contact-lookup");

    const contactLogService = await ContactLogService.getInstance();
    const types = await contactLogService.getContactLogTypes();

    return types;
  } catch (error) {
    console.error("Error fetching contact log types:", error);
    throw new Error("Failed to fetch contact log types");
  }
}

export async function createContactLog(
  contactLogData: Omit<ContactLogInput, "Contact_Log_ID" | "Made_By">
): Promise<ContactLog> {
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

    // Add Made_By from session (User_ID of logged-in user)
    const logDataWithUser = {
      ...contactLogData,
      Made_By: userId,
    };

    const contactLogService = await ContactLogService.getInstance();
    const contactLog = await contactLogService.createContactLog(logDataWithUser);

    return contactLog;
  } catch (error) {
    console.error("Error creating contact log:", error);
    throw new Error("Failed to create contact log");
  }
}

export async function updateContactLog(
  contactLogId: number,
  contactLogData: Partial<Omit<ContactLogInput, "Contact_Log_ID" | "Made_By">>
): Promise<ContactLog> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    if (!userId) {
      throw new Error("Unable to determine user User_ID for audit logging");
    }

    if (!contactLogId || contactLogId <= 0) {
      throw new Error("Valid Contact Log ID is required");
    }

    // Verify the current user owns this contact log entry
    const contactLogService = await ContactLogService.getInstance();
    const existingLog = await contactLogService.getContactLogById(contactLogId);

    if (!existingLog) {
      throw new Error("Contact log not found");
    }

    if (existingLog.Made_By !== userId) {
      throw new Error("You can only edit contact logs that you created");
    }

    // Keep original Made_By (do not reassign ownership on edit)
    const logDataWithUser = {
      ...contactLogData,
      Made_By: userId,
    };

    const contactLog = await contactLogService.updateContactLog(contactLogId, logDataWithUser);

    return contactLog;
  } catch (error) {
    console.error("Error updating contact log:", error);
    if (error instanceof Error && error.message === "You can only edit contact logs that you created") {
      throw error;
    }
    throw new Error("Failed to update contact log");
  }
}

export async function deleteContactLog(contactLogId: number): Promise<void> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "write");

    if (!contactLogId || contactLogId <= 0) {
      throw new Error("Valid Contact Log ID is required");
    }

    const contactLogService = await ContactLogService.getInstance();
    await contactLogService.deleteContactLog(contactLogId);
  } catch (error) {
    console.error("Error deleting contact log:", error);
    throw new Error("Failed to delete contact log");
  }
}

export async function getContactLogsByContactId(contactId: number): Promise<ContactLog[]> {
  try {
    await requireFeatureAccess("contact-lookup");

    if (!contactId || contactId <= 0) {
      throw new Error("Valid contact ID is required");
    }

    const contactLogService = await ContactLogService.getInstance();
    const results = await contactLogService.getContactLogsByContactId(contactId);

    return results;
  } catch (error) {
    console.error("Error fetching contact logs by contact ID:", error);
    throw new Error("Failed to fetch contact logs");
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
): Promise<void> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "write");
    const userId = getMpUserId(session);

    if (!userId) {
      throw new Error("Unable to determine user User_ID for audit logging");
    }

    const contactLogService = await ContactLogService.getInstance();
    await contactLogService.createContactLog({
      Contact_ID: contactId,
      Contact_Log_Type_ID: contactLogTypeId,
      Notes: notes,
      Contact_Date: new Date().toISOString(),
      Made_By: userId,
      Planned_Contact_ID: null,
      Contact_Successful: null,
      Original_Contact_Log_Entry: null,
      Feedback_Entry_ID: null,
    });
  } catch (error) {
    // Fire-and-forget: log but don't throw — don't block the user's action
    console.error("Error creating auto contact log:", error);
  }
}

export async function getContactLogById(contactLogId: number): Promise<ContactLog | null> {
  try {
    await requireFeatureAccess("contact-lookup");

    if (!contactLogId || contactLogId <= 0) {
      throw new Error("Valid contact log ID is required");
    }

    const contactLogService = await ContactLogService.getInstance();
    const result = await contactLogService.getContactLogById(contactLogId);

    return result;
  } catch (error) {
    console.error("Error fetching contact log by ID:", error);
    throw new Error("Failed to fetch contact log");
  }
}
