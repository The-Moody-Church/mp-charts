import { errorForLog } from "@/lib/log-safe";
import { MinistryPlatformClient } from "../client";
import { ProcedureInfo, QueryParams } from "../types";
import { sanitizeIdentifier } from "./guards";

/**
 * Stored procedures this app may execute (upstream MPNext 41bba94 + 3d9ae92).
 *
 * The service account can run any procedure MP exposes, including ones that
 * mutate data, so execution is refused for any name not listed here or passed
 * in through `allowedProcedures`. mp-charts calls none, so the list is empty and
 * every execute call fails closed. To enable one, add its exact name in the same
 * change that adds the caller (or pass it as `new MPHelper({ allowedProcedures })`
 * next to the caller), so the reviewer sees both. Listing procedures through
 * `getProcedures` is metadata only and is not gated.
 */
export const ALLOWED_PROCEDURES: readonly string[] = Object.freeze([]);

export interface ProcedureServiceOptions {
    /**
     * Replaces {@link ALLOWED_PROCEDURES} for this instance. The provider builds
     * it as `ALLOWED_PROCEDURES` plus an `MPHelper`'s `allowedProcedures`; tests
     * pass it directly. Never derive it from request input.
     */
    allowedProcedures?: Iterable<string>;
}

export class ProcedureService {
    private client: MinistryPlatformClient;
    private allowedProcedures: ReadonlySet<string>;

    constructor(client: MinistryPlatformClient, options?: ProcedureServiceOptions) {
        this.client = client;
        this.allowedProcedures = new Set(options?.allowedProcedures ?? ALLOWED_PROCEDURES);
    }

    /**
     * Returns the list of procedures available to the current user with basic metadata.
     */
    public async getProcedures(search?: string): Promise<ProcedureInfo[]> {
        try {
            await this.client.ensureValidToken();

            const params: QueryParams | undefined = search ? { $search: search } : undefined;
            return await this.client.getHttpClient().get<ProcedureInfo[]>('/procs', params);
        } catch (error) {
            console.error('Error getting procedures:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Executes the requested stored procedure retrieving parameters from the query string.
     * @throws Error before any token or network work if the name is not a plain
     *   identifier or not on the allowlist
     */
    public async executeProcedure(
        procedure: string,
        params?: QueryParams
    ): Promise<unknown[][]> {
        const endpoint = this.procedureEndpoint(procedure);
        try {
            await this.client.ensureValidToken();

            const data = await this.client.getHttpClient().get<unknown[][]>(endpoint, params);
            return data;
        } catch (error) {
            console.error('Error executing procedure:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Executes the requested stored procedure with provided parameters in the request body.
     * @throws Error before any token or network work if the name is not a plain
     *   identifier or not on the allowlist
     */
    public async executeProcedureWithBody(
        procedure: string,
        parameters: Record<string, unknown>
    ): Promise<unknown[][]> {
        const endpoint = this.procedureEndpoint(procedure);
        try {
            await this.client.ensureValidToken();

            const data = await this.client.getHttpClient().post<unknown[][]>(endpoint, parameters);
            return data;
        } catch (error) {
            console.error('Error executing procedure:', errorForLog(error));
            throw error;
        }
    }

    /**
     * `/procs/{name}` for a name that is a plain identifier AND on the
     * allowlist (exact, case-sensitive match). Neither message echoes the input.
     */
    private procedureEndpoint(procedure: unknown): string {
        const name = sanitizeIdentifier(procedure, 'procedure name');
        if (!this.allowedProcedures.has(name)) {
            throw new Error('Procedure is not on the allowlist');
        }
        return `/procs/${encodeURIComponent(name)}`;
    }
}
