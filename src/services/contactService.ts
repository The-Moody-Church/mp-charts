import { ContactSearch, ContactLookupDetails, HouseholdMember, ContactBadges } from "@/lib/dto";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeFilterValue, sanitizeGuid, sanitizeIds } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

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
   * Fetches all contacts with name fields for cached search.
   * Returns the full dataset — caller is responsible for filtering/scoring.
   * Auto-paginates in 1,000-record batches via MPHelper.
   */
  public async getAllContactsForSearch(): Promise<ContactSearch[]> {
    return this.mp!.getTableRecords<ContactSearch>({
      table: "Contacts",
      select: "Contacts.[Contact_ID], Contact_GUID, First_Name, Nickname, Last_Name, Email_Address, Mobile_Phone, dp_fileUniqueId AS Image_GUID, Participant_Record_Table.[Participant_ID], Participant_Record_Table.[Member_Status_ID], Participant_Record_Table_Member_Status_ID_Table.[Member_Status], Participant_Record_Table.[Date_Joined]",
    });
  }

  /**
   * Retrieves a specific contact by their GUID
   * 
   * @param contactGuid - The unique GUID identifier for the contact
   * @returns Promise<ContactSearch | null> - The matching contact record or null if not found
   */
  public async getContactByGuid(contactGuid: string): Promise<ContactLookupDetails | null> {
    const validGuid = sanitizeGuid(contactGuid);
    const records = await this.mp!.getTableRecords<ContactLookupDetails>({
      table: "Contacts",
      filter: `Contact_GUID = '${validGuid}'`,
      select: "Contact_ID, Contact_GUID, First_Name, Nickname, Last_Name, Email_Address, Mobile_Phone, dp_fileUniqueId AS Image_GUID, Date_of_Birth, Household_ID, Household_Position_ID, Household_ID_Table_Address_ID_Table.[Address_Line_1], Household_ID_Table_Address_ID_Table.[Address_Line_2], Household_ID_Table_Address_ID_Table.[City], Household_ID_Table_Address_ID_Table.[State/Region] AS State, Household_ID_Table_Address_ID_Table.[Postal_Code], Household_ID_Table.[Home_Address_Unlisted]",
      top: 1
    });

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

  public async getHouseholdMembers(householdId: number): Promise<HouseholdMember[]> {
    const safeId = sanitizeIds([householdId]);
    return this.mp!.getTableRecords<HouseholdMember>({
      table: "Contacts",
      filter: `Household_ID IN (${safeId})`,
      select: "Contact_ID, Contact_GUID, First_Name, Nickname, Last_Name, dp_fileUniqueId AS Image_GUID, Household_Position_ID, Date_of_Birth",
      orderBy: "Household_Position_ID, Date_of_Birth",
    });
  }

  public async getContactBadges(contactId: number): Promise<ContactBadges> {
    const safeContactId = sanitizeIds([contactId]);

    // Step 1: Get the participant record for this contact
    const participants = await this.mp!.getTableRecords<{
      Participant_ID: number;
      Contact_ID: number;
      Member_Status_ID: number | null;
    }>({
      table: "Participants",
      filter: `Contact_ID IN (${safeContactId})`,
      select: "Participant_ID, Contact_ID, Member_Status_ID",
    });

    // Map membership status
    let membershipStatus: ContactBadges['membershipStatus'] = null;
    if (participants.length > 0 && participants[0].Member_Status_ID != null) {
      const statusId = participants[0].Member_Status_ID;
      if (statusId === 1) membershipStatus = 'Member';
      else if (statusId === 4) membershipStatus = 'Associate';
      else if (statusId === 10) membershipStatus = 'Youth';
      else if (statusId >= 5 && statusId <= 9) membershipStatus = 'Dropped';
    }

    // If no participant record, no group/serving data possible
    if (participants.length === 0) {
      return { membershipStatus, inGroup: false, serving: false };
    }

    const participantIds = participants.map(p => p.Participant_ID);
    const safeParticipantIds = sanitizeIds(participantIds);
    const today = new Date().toISOString().split('T')[0];

    // Step 2: Check group membership and serving roles in parallel
    const [groupParticipants, servingParticipants] = await Promise.all([
      // In a Group: active Group_Participant in Small Group (1) or Community (11)
      this.getActiveGroupParticipants(safeParticipantIds, today, [1, 11]),
      // Serving: active Group_Participant with a role that has Group_Role_Type_ID 1 (Leader) or 3 (Servant)
      this.getServingParticipants(safeParticipantIds, today),
    ]);

    return {
      membershipStatus,
      inGroup: groupParticipants.length > 0,
      serving: servingParticipants.length > 0,
    };
  }

  private async getActiveGroupParticipants(
    safeParticipantIds: string,
    today: string,
    groupTypeIds: number[],
  ): Promise<{ Group_Participant_ID: number }[]> {
    // Step 1: Get active groups of the specified types
    const groups = await this.mp!.getTableRecords<{ Group_ID: number }>({
      table: "Groups",
      filter: `Group_Type_ID IN (${groupTypeIds.join(',')}) AND Start_Date <= '${today}' AND (End_Date IS NULL OR End_Date >= '${today}')`,
      select: "Group_ID",
    });

    if (groups.length === 0) return [];

    const groupIds = sanitizeIds(groups.map(g => g.Group_ID));

    // Step 2: Check if any of the participant's group_participant records are in those groups and active
    return this.mp!.getTableRecords<{ Group_Participant_ID: number }>({
      table: "Group_Participants",
      filter: `Participant_ID IN (${safeParticipantIds}) AND Group_ID IN (${groupIds}) AND Start_Date <= '${today}' AND (End_Date IS NULL OR End_Date >= '${today}')`,
      select: "Group_Participant_ID",
      top: 1,
    });
  }

  private async getServingParticipants(
    safeParticipantIds: string,
    today: string,
  ): Promise<{ Group_Participant_ID: number }[]> {
    // Step 1: Get roles that are Leader (1) or Servant (3)
    const roles = await this.mp!.getTableRecords<{ Group_Role_ID: number }>({
      table: "Group_Roles",
      filter: "Group_Role_Type_ID IN (1, 3)",
      select: "Group_Role_ID",
    });

    if (roles.length === 0) return [];

    const roleIds = sanitizeIds(roles.map(r => r.Group_Role_ID));

    // Step 2: Check if any of the participant's group_participant records have serving/leading roles and are active
    return this.mp!.getTableRecords<{ Group_Participant_ID: number }>({
      table: "Group_Participants",
      filter: `Participant_ID IN (${safeParticipantIds}) AND Group_Role_ID IN (${roleIds}) AND Start_Date <= '${today}' AND (End_Date IS NULL OR End_Date >= '${today}')`,
      select: "Group_Participant_ID",
      top: 1,
    });
  }

  public async uploadContactPhoto(
    contactId: number,
    file: File,
    userId?: number
  ): Promise<void> {
    await this.mp!.uploadFiles({
      table: "Contacts",
      recordId: contactId,
      files: [file],
      uploadParams: {
        description: "Contact photo uploaded via Contact Lookup",
        isDefaultImage: true,
        userId,
      },
    });
  }
}