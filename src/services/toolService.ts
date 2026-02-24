import { MPHelper } from "@/lib/providers/ministry-platform";
import { PageData } from "@/lib/tool-params";

/**
 * ToolService - Singleton service for managing tool-related operations
 *
 * This service provides methods to interact with Ministry Platform tools and pages,
 * including retrieving page metadata and table information based on page IDs.
 * Uses the singleton pattern to ensure a single instance across the application.
 */
export class ToolService {
  private static instance: ToolService;
  private mp: MPHelper | null = null;

  private constructor() {}

  /**
   * Returns a ToolService instance.
   * @param accessToken Optional user access token from the OIDC session. When provided,
   *                    creates a per-request instance that authenticates as the logged-in
   *                    user (respecting their MP permissions and producing accurate audit logs).
   *                    When omitted, returns the singleton instance using client credentials.
   */
  public static async getInstance(accessToken?: string): Promise<ToolService> {
    if (accessToken) {
      const instance = new ToolService();
      instance.mp = new MPHelper({ accessToken });
      return instance;
    }
    if (!ToolService.instance) {
      ToolService.instance = new ToolService();
      ToolService.instance.mp = new MPHelper();
    }
    return ToolService.instance;
  }

  /**
   * Retrieves the page data associated with a given Ministry Platform page ID
   *
   * @param pageID - The Ministry Platform Page ID
   * @returns Promise<PageData | null> - The page data or null if not found
   */
  public async getPageData(pageID: number): Promise<PageData | null> {
    try {
      // Execute stored procedure to get page data
      // DomainID is automatically injected by MP API
      const result = await this.mp!.executeProcedureWithBody('api_Tools_GetPageData', {
        "@PageID": pageID
      });

      // The result is an array of result sets, we want the first result set
      if (result && result.length > 0 && result[0].length > 0) {
        return result[0][0] as PageData;
      }

      return null;
    } catch (error) {
      console.error('ToolService.getPageData - Error:', error);
      throw error;
    }
  }

  /**
   * Retrieves the tool paths for a user based on their roles
   *
   * @param domainId - The Ministry Platform Domain ID
   * @param userId - The Ministry Platform User ID
   * @returns Promise<string[]> - Array of tool paths
   */
  public async getUserTools(domainId: number, userId: number): Promise<string[]> {
    try {
      const result = await this.mp!.executeProcedureWithBody('api_Tools_GetUserTools', {
        "@DomainId": domainId,
        "@UserId": userId
      });

      if (result && result.length > 0 && result[0].length > 0) {
        return (result[0] as Array<{ Tool_Path: string }>).map((row) => row.Tool_Path);
      }

      return [];
    } catch (error) {
      console.error('ToolService.getUserTools - Error:', error);
      throw error;
    }
  }
}
