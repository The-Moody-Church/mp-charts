import { ContactLog } from "@/lib/providers/ministry-platform/models/ContactLog";
import { ContactLogTypes } from "@/lib/providers/ministry-platform/models/ContactLogTypes";
import { ContactLogSchema, ContactLogInput } from "@/lib/providers/ministry-platform/models/ContactLogSchema";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeId } from "@/lib/providers/ministry-platform/utils/filter-sanitize";
import { toMpSqlDatetime } from "@/lib/providers/ministry-platform/utils/mp-datetime";

/**
 * What a caller may supply when creating a contact log: exactly the four
 * fields the form edits.
 *
 * `Made_By` is absent because attribution is server-authoritative (F4) — it
 * comes from the acting session, passed as a separate argument so it can never
 * arrive inside a caller-shaped payload object. The link and flag fields
 * (`Planned_Contact_ID`, `Contact_Successful`, `Original_Contact_Log_Entry`,
 * `Feedback_Entry_ID`) are absent because no UI sets them. The type is
 * documentation and compile-time help only; the runtime guard is the Zod
 * `.pick()` allowlist in the service.
 */
export type ContactLogCreateInput = Pick<
  ContactLogInput,
  "Contact_ID" | "Contact_Date" | "Contact_Log_Type_ID" | "Notes"
>;

/**
 * What a caller may supply when updating a contact log: the three fields the
 * edit form changes, each optional.
 *
 * `Made_By` and `Contact_ID` are absent so the original author is preserved
 * and a log cannot be re-parented onto a different contact; the link and flag
 * fields are absent because the edit form never sends them.
 */
export type ContactLogUpdateInput = Partial<
  Pick<ContactLogInput, "Contact_Date" | "Contact_Log_Type_ID" | "Notes">
>;

/**
 * The runtime allowlists. A `z.object` parse STRIPS keys the schema does not
 * declare, so anything outside these picks (a smuggled `Made_By`, `Contact_ID`
 * on update, or a link field) is dropped, not merely untyped. Do not add
 * `.passthrough()`/`z.looseObject` to `ContactLogSchema` or to these picks —
 * the strip is the control (upstream MPNext dc4a25b, adapted).
 */
const ContactLogCreateSchema = ContactLogSchema.pick({
  Contact_ID: true,
  Contact_Date: true,
  Contact_Log_Type_ID: true,
  Notes: true,
});

const ContactLogUpdateSchema = ContactLogSchema.pick({
  Contact_Date: true,
  Contact_Log_Type_ID: true,
  Notes: true,
}).partial();


/**
 * ContactLogService - Singleton service for managing contact log operations
 * 
 * This service provides methods to interact with contact log data from Ministry Platform,
 * including retrieving, creating, updating, and deleting contact log records.
 * Uses the singleton pattern to ensure a single instance across the application.
 */
export class ContactLogService {
  private static instance: ContactLogService;
  private mp: MPHelper | null = null;

  private constructor() {}

  /**
   * Returns a ContactLogService instance.
   * @param accessToken Optional user access token from the OIDC session. When provided,
   *                    creates a per-request instance that authenticates as the logged-in
   *                    user (respecting their MP permissions and producing accurate audit logs).
   *                    When omitted, returns the singleton instance using client credentials.
   */
  public static async getInstance(accessToken?: string): Promise<ContactLogService> {
    if (accessToken) {
      const instance = new ContactLogService();
      instance.mp = new MPHelper({ accessToken });
      return instance;
    }
    if (!ContactLogService.instance) {
      ContactLogService.instance = new ContactLogService();
      ContactLogService.instance.mp = new MPHelper();
    }
    return ContactLogService.instance;
  }

  /**
   * Retrieves all contact log types
   * 
   * @returns Promise<ContactLogTypes[]> - Array of all contact log type records
   */
  public async getContactLogTypes(): Promise<ContactLogTypes[]> {
    const records = await this.mp!.getTableRecords<ContactLogTypes>({
      table: "Contact_Log_Types",
      select: "Contact_Log_Type_ID,Contact_Log_Type,Description",
      top: 100,
      orderBy: "Contact_Log_Type"
    });

    return records;
  }

  /**
   * Retrieves a specific contact log record by its ID
   * 
   * @param contactLogId - The unique ID of the contact log record
   * @returns Promise<ContactLog | null> - The matching contact log record or null if not found
   */
  public async getContactLogById(contactLogId: number): Promise<ContactLog | null> {
    const records = await this.mp!.getTableRecords<ContactLog>({
      table: "Contact_Log",
      filter: `Contact_Log_ID = ${sanitizeId(contactLogId)}`,
      select: "Contact_Log_ID,Contact_ID,Contact_Date,Made_By,Notes,Contact_Log_Type_ID,Planned_Contact_ID,Contact_Successful,Original_Contact_Log_Entry,Feedback_Entry_ID",
      top: 1
    });
    
    return records.length > 0 ? records[0] : null;
  }

  /**
   * Retrieves all contact log records for a specific contact
   * 
   * @param contactId - The contact ID to get logs for
   * @returns Promise<ContactLog[]> - Array of contact log records for the contact
   */
  public async getContactLogsByContactId(contactId: number): Promise<ContactLog[]> {
    const records = await this.mp!.getTableRecords<ContactLog>({
      table: "Contact_Log",
      filter: `Contact_ID = ${sanitizeId(contactId)}`,
      select: "Contact_Log_ID,Contact_ID,Contact_Date,Made_By,Notes,Contact_Log_Type_ID,Planned_Contact_ID,Contact_Successful,Original_Contact_Log_Entry,Feedback_Entry_ID",
      top: 500,
      orderBy: "Contact_Date DESC"
    });
    
    return records;
  }

  /**
   * Creates a new contact log record.
   *
   * **Attribution is server-authoritative (F4).** `Made_By` comes ONLY from
   * the `madeBy` argument, which the action layer supplies from the session —
   * never from `contactLogData`. A server action is a POST endpoint whose
   * payload shape the caller controls, and TypeScript types are erased at
   * runtime, so a narrow parameter type guards nothing on its own. The Zod
   * `.pick()` allowlist (`ContactLogCreateSchema`) is what actually strips a
   * smuggled key: a `z.object` parse drops keys the schema does not declare,
   * and the pick declares only `Contact_ID`, `Contact_Date`,
   * `Contact_Log_Type_ID` and `Notes`. **That pick is the control** — the
   * explicit record literal below is only defense in depth.
   *
   * | Field | Create | Update |
   * |---|---|---|
   * | `Made_By` | this `madeBy` argument | never sent — MP preserves the original author |
   * | `Contact_ID` | caller's subject contact, `sanitizeId`'d | never sent — a log cannot be re-parented |
   * | link/flag fields | never sent | never sent |
   *
   * (Adapted from upstream MPNext d7adaf8 / PR #85. Upstream stamps the
   * EDITOR on update because any role-holder may edit any log; our policy is
   * owner-only edit with the original author preserved, so we omit `Made_By`
   * on update instead. Under owner-only edit the two are equivalent today,
   * and omitting stays correct if admins are ever allowed to edit others'
   * logs.)
   *
   * @param contactLogData - The four form fields. `Made_By` and the link/flag
   *   fields are not accepted (dropped by the pick if smuggled).
   * @param madeBy - Acting MP `User_ID`, from the session. The only source of
   *   `Made_By`, and the `$userId` for MP's audit trail.
   */
  public async createContactLog(
    contactLogData: ContactLogCreateInput,
    madeBy: number,
  ): Promise<ContactLog> {
    // Fail before touching MP if the caller could not supply an acting user.
    const actingUserId = sanitizeId(madeBy);

    // The `.pick()` allowlist STRIPS a smuggled Made_By or link field rather
    // than merely leaving it untyped. Do not add `.passthrough()`/
    // `z.looseObject` — the strip is the control.
    const validatedData = ContactLogCreateSchema.parse(contactLogData);

    // React Flight args are type-erased, so a "number" can arrive as a string.
    const contactId = sanitizeId(validatedData.Contact_ID);

    // Convert ISO date to SQL format in Central Time (YYYY-MM-DD HH:MM:SS)
    // Ministry Platform interprets dates as US Central Time
    const contactDate = validatedData.Contact_Date
      ? toMpSqlDatetime(validatedData.Contact_Date)
      : validatedData.Contact_Date;

    // Built field by field, never spread, so the payload is exactly what is
    // listed here even if the pick is ever widened by mistake.
    const record = {
      Contact_ID: contactId,
      Contact_Date: contactDate,
      Contact_Log_Type_ID: validatedData.Contact_Log_Type_ID,
      Notes: validatedData.Notes,
      Made_By: actingUserId,
    };

    const result = await this.mp!.createTableRecords(
      "Contact_Log",
      [record],
      { $userId: actingUserId }
    );
    
    if (!result || result.length === 0) {
      throw new Error('Failed to create contact log record');
    }
    
    return result[0] as ContactLog;
  }

  /**
   * Updates an existing contact log record.
   *
   * Neither `Made_By` nor `Contact_ID` is ever sent (F4) — MP preserves both.
   * That keeps the original author intact and makes a log un-re-parentable.
   * The `.pick()` allowlist (`ContactLogUpdateSchema`) admits only
   * `Contact_Date`, `Contact_Log_Type_ID` and `Notes`; the link and flag
   * fields are dropped too, because the edit form never sends them and
   * accepting them would only widen what a crafted request can do.
   *
   * @param contactLogId - The record to update.
   * @param contactLogData - Partial data: `Contact_Date`, `Contact_Log_Type_ID`
   *   and `Notes` only; anything else is dropped by the pick.
   * @param actorUserId - Acting MP `User_ID`, from the session, for `$userId`.
   */
  public async updateContactLog(
    contactLogId: number,
    contactLogData: ContactLogUpdateInput,
    actorUserId: number
  ): Promise<ContactLog> {
    const actingUserId = sanitizeId(actorUserId);

    // The pick allowlist strips Made_By, Contact_ID and the link/flag fields if
    // a caller smuggles them.
    const validatedData = ContactLogUpdateSchema.parse(contactLogData);

    // Convert ISO date to SQL format in Central Time after validation
    if (validatedData.Contact_Date) {
      validatedData.Contact_Date = toMpSqlDatetime(validatedData.Contact_Date);
    }
    
    // Add the ID to the data for the update (service-boundary re-validation)
    const updateData = { Contact_Log_ID: sanitizeId(contactLogId), ...validatedData };
    
    const result = await this.mp!.updateTableRecords(
      "Contact_Log",
      [updateData],
      { $userId: actingUserId }
    );
    
    if (!result || result.length === 0) {
      throw new Error('Failed to update contact log record');
    }
    
    return result[0] as ContactLog;
  }

  /**
   * Deletes a contact log record.
   *
   * @param contactLogId - The record to delete.
   * @param actorUserId - Acting MP `User_ID`, from the session, for `$userId`
   *   so MP's audit trail names the staff member rather than the API client.
   */
  public async deleteContactLog(contactLogId: number, actorUserId: number): Promise<void> {
    await this.mp!.deleteTableRecords(
      "Contact_Log",
      [sanitizeId(contactLogId)],
      { $userId: sanitizeId(actorUserId) }
    );
  }
}
