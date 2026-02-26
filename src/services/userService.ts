import { MPUserProfile } from "@/lib/providers/ministry-platform/types";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeGuid, sanitizeIds } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

interface CachedProfile {
  profile: MPUserProfile;
  expiresAt: number;
}

/**
 * UserService - Singleton service for managing user-related operations
 *
 * This service provides methods to interact with user data from Ministry Platform,
 * including retrieving user profiles and related contact information.
 *
 * Profile data is cached in-memory (15-min TTL) to avoid redundant MP API calls
 * during authorization checks. The cache can be flushed via flushProfileCache().
 */
export class UserService {
  private static instance: UserService;
  private mp: MPHelper | null = null;
  private static profileCache = new Map<string, CachedProfile>();
  private static CACHE_TTL = 15 * 60 * 1000; // 15 minutes

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
   * Retrieves a user profile by User GUID from Ministry Platform.
   * Results are cached for 15 minutes to reduce API calls during authorization checks.
   *
   * Fetches user information including:
   * - User ID, GUID, Contact ID
   * - Contact details (First Name, Nickname, Last Name)
   * - Email Address, Mobile Phone, Profile Image GUID
   * - Roles (from dp_User_Roles)
   * - User Groups with IDs (from dp_User_User_Groups)
   *
   * @param id - The User GUID to search for
   * @returns The user profile with roles and groups, or undefined if not found
   */
  public async getUserProfile(id: string): Promise<MPUserProfile | undefined> {
    const validGuid = sanitizeGuid(id);

    // Check cache first
    const cached = UserService.profileCache.get(validGuid);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.profile;
    }

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
      this.mp!.getTableRecords<{ User_Group_ID: number; User_Group_Name: string }>({
        table: "dp_User_User_Groups",
        filter: `User_ID = ${sanitizeIds([profile.User_ID])}`,
        select: "User_Group_ID_TABLE.User_Group_ID, User_Group_ID_TABLE.User_Group_Name",
      }),
    ]);

    const result: MPUserProfile = {
      ...profile,
      roles: rolesRecords.map((r) => r.Role_Name),
      userGroups: groupsRecords.map((g) => g.User_Group_Name),
      userGroupIds: groupsRecords.map((g) => g.User_Group_ID),
    };

    // Cache the result
    UserService.profileCache.set(validGuid, {
      profile: result,
      expiresAt: Date.now() + UserService.CACHE_TTL,
    });

    return result;
  }

  /**
   * Flushes all cached user profiles.
   * Called from the admin page when group assignments change.
   */
  public static flushProfileCache(): void {
    UserService.profileCache.clear();
  }
}
