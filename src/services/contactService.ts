import { ContactSearch } from "@/lib/dto";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeFilterValue, sanitizeGuid } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

/**
 * ContactService - Singleton service for managing contact-related operations
 * 
 * This service provides methods to interact with contact data from Ministry Platform,
 * including searching for contacts and retrieving individual contact information.
 * Uses the singleton pattern to ensure a single instance across the application.
 */
export class ContactService {
  private static instance: ContactService;
  private mp: MPHelper | null = null;

  private constructor() {}

  /**
   * Returns a ContactService instance.
   * @param accessToken Optional user access token from the OIDC session. When provided,
   *                    creates a per-request instance that authenticates as the logged-in
   *                    user (respecting their MP permissions and producing accurate audit logs).
   *                    When omitted, returns the singleton instance using client credentials.
   */
  public static async getInstance(accessToken?: string): Promise<ContactService> {
    if (accessToken) {
      const instance = new ContactService();
      instance.mp = new MPHelper({ accessToken });
      return instance;
    }
    if (!ContactService.instance) {
      ContactService.instance = new ContactService();
      ContactService.instance.mp = new MPHelper();
    }
    return ContactService.instance;
  }

  /**
   * Searches for contacts based on a search term
   * Performs a fuzzy search across multiple contact fields including name, email, and phone
   * 
   * @param search - The search term to match against contact fields
   * @returns Promise<ContactSearch[]> - Array of matching contacts (limited to 20 results)
   */
  public async contactSearch(search: string): Promise<ContactSearch[]> {
    const safe = sanitizeFilterValue(search);
    const records = await this.mp!.getTableRecords<ContactSearch>({
      table: "Contacts",
      filter: `First_Name LIKE '%${safe}%' OR Last_Name LIKE '%${safe}%' OR Nickname LIKE '%${safe}%' OR Email_Address LIKE '%${safe}%' OR Mobile_Phone LIKE '%${safe}%'`,
      select: "Contact_ID, Contact_GUID,First_Name,Nickname,Last_Name,Email_Address,Mobile_Phone,dp_fileUniqueId AS Image_GUID",
      top: 20
    });
    
    return records;
  }

  /**
   * Retrieves a specific contact by their GUID
   * 
   * @param contactGuid - The unique GUID identifier for the contact
   * @returns Promise<ContactSearch | null> - The matching contact record or null if not found
   */
  public async getContactByGuid(contactGuid: string): Promise<ContactSearch | null> {
    const validGuid = sanitizeGuid(contactGuid);
    const records = await this.mp!.getTableRecords<ContactSearch>({
      table: "Contacts",
      filter: `Contact_GUID = '${validGuid}'`,
      select: "Contact_ID, Contact_GUID,First_Name,Nickname,Last_Name,Email_Address,Mobile_Phone,dp_fileUniqueId AS Image_GUID",
      top: 1
    });
    
    // Return the first (and should be only) matching record, or null if not found
    return records.length > 0 ? records[0] : null;
  }

  /**
   * Updates specific fields for a contact
   * 
   * @param contactId - The Contact_ID of the contact to update
   * @param fields - Partial object containing the fields to update (Email_Address, Mobile_Phone)
   * @returns Promise<void>
   */
  public async updateContact(
    contactId: number,
    fields: Partial<Pick<ContactSearch, "Email_Address" | "Mobile_Phone">>
  ): Promise<void> {
    const record = { Contact_ID: contactId, ...fields };

    await this.mp!.updateTableRecords(
      "Contacts",
      [record]
    );
  }
}