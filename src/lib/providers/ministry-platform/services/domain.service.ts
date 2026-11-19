import { errorForLog } from "@/lib/log-safe";
import { MinistryPlatformClient } from "../client";
import { DomainInfo, GlobalFilterItem, GlobalFilterParams, QueryParams } from "../types";
import { sanitizeId } from "../utils/filter-sanitize";

export class DomainService {
    private client: MinistryPlatformClient;

    constructor(client: MinistryPlatformClient) {
        this.client = client;
    }

    /**
     * Returns the basic information about the current domain.
     * @returns Promise with the domain information
     */
    public async getDomainInfo(): Promise<DomainInfo> {
        try {
            await this.client.ensureValidToken();
            return await this.client.getHttpClient().get('/domain');
        } catch (error) {
            console.error('Error getting domain info:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Returns the lookup values to be used as global filters. The key corresponds to
     * an identifier and the value corresponds to a friendly name (description). Zero (0)
     * identifier corresponds to records with not assigned filters.
     * @param params Optional parameters for the global filters request
     * @returns Promise with an array of global filter items
     */
    public async getGlobalFilters(params?: GlobalFilterParams): Promise<GlobalFilterItem[]> {
        // Forward `$userId` only, validated. Anything else on `params` (such as a
        // cast-in `$ignorePermissions`, audit N21) is dropped, never sent.
        const query: QueryParams | undefined =
            params?.$userId !== undefined ? { $userId: sanitizeId(params.$userId) } : undefined;
        try {
            await this.client.ensureValidToken();
            return await this.client.getHttpClient().get('/domain/filters', query);
        } catch (error) {
            console.error('Error getting global filters:', errorForLog(error));
            throw error;
        }
    }
}