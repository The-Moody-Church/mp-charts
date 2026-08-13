import { ContactSearch, ContactLookupDetails, HouseholdMember, ContactBadges, ContactGroupMembership } from "@/lib/dto";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeLikeValue, sanitizeGuid, sanitizeIds } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

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
    const safe = sanitizeLikeValue(search);
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
      select: "Contacts.[Contact_ID], Contact_GUID, First_Name, Nickname, Last_Name, Email_Address, Mobile_Phone, dp_fileUniqueId AS Image_GUID, Contacts.[Contact_Status_ID], Participant_Record_Table.[Participant_ID], Participant_Record_Table.[Member_Status_ID], Participant_Record_Table_Member_Status_ID_Table.[Member_Status], Participant_Record_Table.[Date_Joined], Participant_Record_Table.[Participant_Engagement_ID]",
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
      select: "Contact_ID, Contact_GUID, First_Name, Nickname, Last_Name, Email_Address, Mobile_Phone, dp_fileUniqueId AS Image_GUID, Date_of_Birth, Contacts.[Household_ID], Household_Position_ID, Household_ID_Table_Address_ID_Table.[Address_Line_1], Household_ID_Table_Address_ID_Table.[Address_Line_2], Household_ID_Table_Address_ID_Table.[City], Household_ID_Table_Address_ID_Table.[State/Region], Household_ID_Table_Address_ID_Table.[Postal_Code], Household_ID_Table.[Home_Address_Unlisted]",
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
      select: "Contact_ID, Contact_GUID, First_Name, Nickname, Last_Name, dp_fileUniqueId AS Image_GUID, Contacts.[Household_Position_ID], Household_Position_ID_Table.[Household_Position], Date_of_Birth",
      orderBy: "Contacts.[Household_Position_ID], Date_of_Birth",
    });
  }

  /** Minor Child household position ID */
  private static MINOR_CHILD_POSITION_ID = 2;
  /** Age or Grade group type ID */
  private static AGE_GRADE_GROUP_TYPE_ID = 4;

  public async getContactBadges(contactId: number, householdPositionId?: number | null): Promise<ContactBadges> {
    const safeContactId = sanitizeIds([contactId]);

    // Step 1: Get the participant record for this contact (including Member_Status string and Date_Joined)
    const participants = await this.mp!.getTableRecords<{
      Participant_ID: number;
      Contact_ID: number;
      Member_Status_ID: number | null;
      Member_Status: string | null;
      Date_Joined: string | null;
    }>({
      table: "Participants",
      filter: `Contact_ID IN (${safeContactId})`,
      select: "Participant_ID, Contact_ID, Participants.[Member_Status_ID], Member_Status_ID_Table.[Member_Status], Date_Joined",
    });

    // Use the MP Member_Status string directly (e.g., "Registered Member", "Associate Member")
    let membershipStatus: string | null = null;
    let membershipStatusId: number | null = null;
    let membershipDate: string | null = null;
    if (participants.length > 0 && participants[0].Member_Status_ID != null) {
      membershipStatusId = participants[0].Member_Status_ID;
      membershipStatus = participants[0].Member_Status ?? null;

      // For active members (Registered=1, Associate=4, Youth=10), use Date_Joined
      if ([1, 4, 10].includes(membershipStatusId)) {
        membershipDate = participants[0].Date_Joined ?? null;
      }
    }

    // If no participant record, no group/serving data possible — but still fetch last activity
    if (participants.length === 0) {
      const lastActivity = await this.getLastActivityDate(safeContactId);
      return { membershipStatus, membershipStatusId, membershipDate, inGroup: false, serving: false, lastActivity, ageGradeGroups: [] };
    }

    const participantIds = participants.map(p => p.Participant_ID);
    const safeParticipantIds = sanitizeIds(participantIds);
    const today = new Date().toISOString().split('T')[0];
    const isDropped = membershipStatusId != null && [5, 6, 7, 8, 9].includes(membershipStatusId);

    const isMinorChild = householdPositionId === ContactService.MINOR_CHILD_POSITION_ID;

    // Step 2: Check group membership, serving roles, last activity, dropped date, and age/grade groups in parallel
    const [groupParticipants, servingParticipants, lastActivity, droppedDate, ageGradeGroups] = await Promise.all([
      // In a Group: active Group_Participant in Small Group (1) or Community (11)
      this.getActiveGroupParticipants(safeParticipantIds, today, [1, 11]),
      // Serving: active Group_Participant with a role that has Group_Role_Type_ID 1 (Leader) or 3 (Servant)
      this.getServingParticipants(safeParticipantIds, today),
      // Last activity: most recent Activity_Log entry (NOT Contact_Log — see below)
      this.getLastActivityDate(safeContactId),
      // Dropped date: milestone 49 for dropped members (status 5-9)
      isDropped ? this.getDroppedMilestoneDate(safeParticipantIds) : Promise.resolve(null),
      // Age/Grade groups: only for Minor Child contacts
      isMinorChild ? this.getAgeGradeGroupNames(safeParticipantIds, today) : Promise.resolve([]),
    ]);

    // For dropped members, use the milestone date if available
    if (isDropped && droppedDate) {
      membershipDate = droppedDate;
    }

    return {
      membershipStatus,
      membershipStatusId,
      membershipDate,
      inGroup: groupParticipants.length > 0,
      serving: servingParticipants.length > 0,
      lastActivity,
      ageGradeGroups,
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
      filter: `Group_Type_ID IN (${sanitizeIds(groupTypeIds)}) AND Start_Date <= '${today}' AND (End_Date IS NULL OR End_Date >= '${today}')`,
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

  /**
   * Most recent entry in MP's platform-maintained `Activity_Log`.
   *
   * This is NOT `Contact_Log`, despite the similar name. Creating a contact log
   * through our API does not move this date — verified in production 2026-08-13 —
   * so the badge means "this record was last touched in MP", not "we last reached
   * out to this person". Don't infer otherwise from the badge label.
   *
   * Page 316 is Group Participants, excluded so that routine group-roster churn
   * doesn't read as contact activity (see c028eb8, issue #92).
   */
  private async getLastActivityDate(safeContactId: string): Promise<string | null> {
    const logs = await this.mp!.getTableRecords<{ Activity_Date: string }>({
      table: "Activity_Log",
      filter: `Contact_ID IN (${safeContactId}) AND Page_ID <> 316`,
      select: "Activity_Date",
      orderBy: "Activity_Date DESC",
      top: 1,
    });
    return logs.length > 0 ? logs[0].Activity_Date : null;
  }

  private async getAgeGradeGroupNames(
    safeParticipantIds: string,
    today: string,
  ): Promise<string[]> {
    // Get active group participations in Age or Grade groups (Group_Type_ID = 4)
    const records = await this.mp!.getTableRecords<{ Group_Name: string }>({
      table: "Group_Participants",
      filter: `Participant_ID IN (${safeParticipantIds}) AND Group_Participants.[Start_Date] <= '${today}' AND (Group_Participants.[End_Date] IS NULL OR Group_Participants.[End_Date] >= '${today}') AND Group_ID_Table.[Group_Type_ID] = ${ContactService.AGE_GRADE_GROUP_TYPE_ID} AND Group_ID_Table.[Start_Date] <= '${today}' AND (Group_ID_Table.[End_Date] IS NULL OR Group_ID_Table.[End_Date] >= '${today}')`,
      select: "Group_ID_Table.[Group_Name]",
    });
    return records.map(r => r.Group_Name);
  }

  private async getDroppedMilestoneDate(safeParticipantIds: string): Promise<string | null> {
    const milestones = await this.mp!.getTableRecords<{ Date_Accomplished: string | null }>({
      table: "Participant_Milestones",
      filter: `Participant_ID IN (${safeParticipantIds}) AND Milestone_ID = 49`,
      select: "Date_Accomplished",
      orderBy: "Date_Accomplished DESC",
      top: 1,
    });
    return milestones.length > 0 ? milestones[0].Date_Accomplished ?? null : null;
  }

  /**
   * Returns all currently-active group memberships for a contact, keyed off the contact's
   * Participant_Record. "Active" means today is between Group_Participants.Start_Date and End_Date,
   * AND the parent Group itself is active over the same window.
   */
  public async getContactGroupMemberships(contactId: number): Promise<ContactGroupMembership[]> {
    const safeContactId = sanitizeIds([contactId]);

    const participants = await this.mp!.getTableRecords<{ Participant_ID: number }>({
      table: "Participants",
      filter: `Contact_ID IN (${safeContactId})`,
      select: "Participant_ID",
    });

    if (participants.length === 0) return [];

    const safeParticipantIds = sanitizeIds(participants.map(p => p.Participant_ID));
    const today = new Date().toISOString().split('T')[0];

    return this.mp!.getTableRecords<ContactGroupMembership>({
      table: "Group_Participants",
      filter: `Participant_ID IN (${safeParticipantIds}) AND Group_Participants.[Start_Date] <= '${today}' AND (Group_Participants.[End_Date] IS NULL OR Group_Participants.[End_Date] >= '${today}') AND Group_ID_Table.[Start_Date] <= '${today}' AND (Group_ID_Table.[End_Date] IS NULL OR Group_ID_Table.[End_Date] >= '${today}')`,
      select: "Group_Participant_ID, Group_Participants.[Group_ID], Group_ID_Table.[Group_Name], Group_ID_Table.[Group_Type_ID], Group_ID_Table_Group_Type_ID_Table.[Group_Type], Group_Participants.[Group_Role_ID], Group_Role_ID_Table.[Role_Title] AS Role, Group_Participants.[Start_Date], Group_Participants.[End_Date]",
      orderBy: "Group_ID_Table_Group_Type_ID_Table.[Group_Type], Group_ID_Table.[Group_Name]",
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