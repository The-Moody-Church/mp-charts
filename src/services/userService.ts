import { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeGuid, sanitizeIds } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

/**
 * UserService - Singleton service for managing user-related operations
 * 
 * This service provides methods to interact with user data from Ministry Platform,
 * including retrieving user profiles and related contact information.
 */
export class UserService {
  private static instance: UserService;
  private mp: MPHelper | null = null;

  private constructor() {}

  /**
   * Returns a UserService instance.
   * @param accessToken Optional user access token from the OIDC session. When provided,
   *                    creates a per-request instance that authenticates as the logged-in
   *                    user (respecting their MP permissions and producing accurate audit logs).
   *                    When omitted, returns the singleton instance using client credentials.
   */
  public static async getInstance(accessToken?: string): Promise<UserService> {
    if (accessToken) {
      const instance = new UserService();
      instance.mp = new MPHelper({ accessToken });
      return instance;
    }
    if (!UserService.instance) {
      UserService.instance = new UserService();
      UserService.instance.mp = new MPHelper();
    }
    return UserService.instance;
  }

  /**
   * Retrieves a user profile by User GUID from Ministry Platform
   *
   * Fetches user information including:
   * - User ID, GUID, Contact ID
   * - Contact details (First Name, Nickname, Last Name)
   * - Email Address, Mobile Phone, Profile Image GUID
   * - Roles (from dp_User_Roles)
   * - User Groups (from dp_User_User_Groups)
   *
   * @param id - The User GUID to search for
   * @returns The user profile with roles and groups, or undefined if not found
   */
  public async getUserProfile(id: string): Promise<MPUserProfile | undefined> {
    const validGuid = sanitizeGuid(id);
    const records = await this.mp!.getTableRecords<MPUserProfile>({
      table: "dp_Users",
      filter: `User_GUID = '${validGuid}'`,
      select: "User_ID, User_GUID, Contact_ID_TABLE.First_Name,Contact_ID_TABLE.Nickname,Contact_ID_TABLE.Last_Name,Contact_ID_TABLE.Email_Address,Contact_ID_TABLE.Mobile_Phone,Contact_ID_TABLE.dp_fileUniqueId AS Image_GUID",
      top: 1
    });

    const profile = records[0];
    if (!profile) {
      return undefined;
    }

    // Fetch roles and groups in parallel
    const [rolesRecords, groupsRecords] = await Promise.all([
      this.mp!.getTableRecords<{ Role_Name: string }>({
        table: "dp_User_Roles",
        filter: `User_ID = ${sanitizeIds([profile.User_ID])}`,
        select: "Role_ID_TABLE.Role_Name",
      }),
      this.mp!.getTableRecords<{ User_Group_Name: string }>({
        table: "dp_User_User_Groups",
        filter: `User_ID = ${sanitizeIds([profile.User_ID])}`,
        select: "User_Group_ID_TABLE.User_Group_Name",
      }),
    ]);

    return {
      ...profile,
      roles: rolesRecords.map((r) => r.Role_Name),
      userGroups: groupsRecords.map((g) => g.User_Group_Name),
    };
  }
}