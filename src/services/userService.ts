import { mpUserProfile } from "@/providers/MinistryPlatform/Interfaces/mpUserProfile";
import { MPHelper } from "@/providers/MinistryPlatform/mpHelper";

/**
 * UserService - Singleton service for managing user-related operations
 * 
 * This service provides methods to interact with user data from Ministry Platform,
 * including retrieving user profiles and related contact information.
 */
export class UserService {
  private static instance: UserService;
  private mp: MPHelper | null = null;

  /**
   * Private constructor to enforce singleton pattern
   * Initializes the service when instantiated
   */
  private constructor() {
    this.initialize();
  }

  /**
   * Gets the singleton instance of UserService
   * Creates a new instance if one doesn't exist and ensures it's properly initialized
   * 
   * @returns Promise<UserService> - The initialized UserService instance
   */
  public static async getInstance(): Promise<UserService> {
    if (!UserService.instance) {
      UserService.instance = new UserService();
      await UserService.instance.initialize();
    }
    return UserService.instance;
  }

  /**
   * Initializes the UserService by creating a new MPHelper instance
   * This method sets up the Ministry Platform connection helper
   * 
   * @returns Promise<void>
   */
  private async initialize(): Promise<void> {
    this.mp = new MPHelper();
  }

  /**
   * Retrieves a user profile by User GUID from Ministry Platform
   * 
   * Fetches user information including:
   * - User GUID
   * - Contact details (First Name, Nickname, Last Name)
   * - Email Address
   * - Mobile Phone
   * - Profile Image GUID
   * 
   * @param id - The User GUID to search for
   * @returns Promise<mpUserProfile> - The user profile data from Ministry Platform
   * @throws Will throw an error if the Ministry Platform query fails
   */
  public async getUserProfile(id: string): Promise<mpUserProfile> {
    const records = await this.mp!.getTableRecords<mpUserProfile>({
      table: "dp_Users",
      filter: `User_GUID = '${id}'`,
      select: "User_GUID, Contact_ID_TABLE.First_Name,Contact_ID_TABLE.Nickname,Contact_ID_TABLE.Last_Name,Contact_ID_TABLE.Email_Address,Contact_ID_TABLE.Mobile_Phone,Contact_ID_TABLE.dp_fileUniqueId AS Image_GUID",
      top: 1
    });
    
    // Return the first (and should be only) matching record
    return records[0];
  }
}