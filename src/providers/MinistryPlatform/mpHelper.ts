import { ministryPlatformProvider } from "./ministryPlatformProvider";
import { 
    TableQueryParams, 
    ProcedureInfo, 
    CommunicationInfo, 
    Communication, 
    MessageInfo,
    DomainInfo,
    GlobalFilterItem,
    GlobalFilterParams,
    TableRecord,
    FileDescription,
    FileUploadParams,
    FileUpdateParams,
    TableMetadata,
    QueryParams
} from "./Interfaces/mpProviderInterfaces";

export class MPHelper {
    private provider: ministryPlatformProvider;

    constructor() {
        this.provider = ministryPlatformProvider.getInstance();
    }

    // Table Service Methods
    /**
     * Gets records from a Ministry Platform table with type-safe return values
     * @template T The type to deserialize the response to
     * @param params Object containing table name and query parameters to filter the results
     * @returns Promise containing the deserialized records of type T
     */
    public async getTableRecords<T>(params: {
        table: string,
        select?: string,
        filter?: string,
        orderBy?: string,
        groupBy?: string,
        having?: string,
        top?: number,
        skip?: number,
        distinct?: boolean,
        userId?: number,
        globalFilterId?: number
    }): Promise<T[]> {
        const {
            table, select, filter, orderBy, groupBy, having,
            top, skip, distinct, userId, globalFilterId
        } = params;

        const queryParams: TableQueryParams = {
            $select: select,
            $filter: filter,
            $orderby: orderBy,
            $groupby: groupBy,
            $having: having,
            $top: top,
            $skip: skip,
            $distinct: distinct,
            $userId: userId,
            $globalFilterId: globalFilterId,
        };
        
        return await this.provider.getTableRecords<T>(table, queryParams);
    }

    /**
     * Creates new records in the specified table.
     * @param table Table where records need to be created
     * @param records Array of records to be added to the table
     * @param params Additional query parameters
     * @returns Promise with the created records
     */
    public async createTableRecords<T extends TableRecord = TableRecord>(
        table: string, 
        records: T[], 
        params?: Pick<TableQueryParams, '$select' | '$userId'>
    ): Promise<T[]> {
        return await this.provider.createTableRecords<T>(table, records, params);
    }

    /**
     * Updates provided records in the specified table.
     * @param table Table where records need to be updated
     * @param records Array of records to be updated in the table
     * @param params Additional query parameters
     * @returns Promise with the updated records
     */
    public async updateTableRecords<T extends TableRecord = TableRecord>(
        table: string, 
        records: T[], 
        params?: Pick<TableQueryParams, '$select' | '$userId' | '$allowCreate'>
    ): Promise<T[]> {
        return await this.provider.updateTableRecords<T>(table, records, params);
    }

    /**
     * Deletes multiple records from the specified table.
     * @param table Table where records need to be deleted
     * @param ids Array of identifiers corresponding to records to be deleted
     * @param params Additional query parameters
     * @returns Promise with the deleted records
     */
    public async deleteTableRecords<T extends TableRecord = TableRecord>(
        table: string, 
        ids: number[], 
        params?: Pick<TableQueryParams, '$select' | '$userId'>
    ): Promise<T[]> {
        return await this.provider.deleteTableRecords<T>(table, ids, params);
    }

    // Domain Service Methods
    /**
     * Returns the basic information about the current domain.
     * @returns Promise with the domain information
     */
    public async getDomainInfo(): Promise<DomainInfo> {
        return await this.provider.getDomainInfo();
    }

    /**
     * Returns the lookup values to be used as global filters.
     * @param params Optional parameters for the global filters request
     * @returns Promise with an array of global filter items
     */
    public async getGlobalFilters(params?: GlobalFilterParams): Promise<GlobalFilterItem[]> {
        return await this.provider.getGlobalFilters(params);
    }

    // Metadata Service Methods
    /**
     * Triggers an update of the metadata cache on all servers and in all applications.
     * @returns Promise with the response from the API
     */
    public async refreshMetadata(): Promise<void> {
        return await this.provider.refreshMetadata();
    }

    /**
     * Returns the list of tables available to the current user with basic metadata.
     * @param search Optional search term to filter tables
     * @returns Promise with an array of TableMetadata objects
     */
    public async getTables(search?: string): Promise<TableMetadata[]> {
        return await this.provider.getTables(search);
    }

    // Procedure Service Methods
    /**
     * Returns the list of procedures available to the current user with basic metadata.
     * @param search Optional search term to filter procedures
     * @returns Promise with an array of ProcedureInfo objects
     */
    public async getProcedures(search?: string): Promise<ProcedureInfo[]> {
        return await this.provider.getProcedures(search);
    }

    /**
     * Executes the requested stored procedure retrieving parameters from the query string.
     * @param procedure Stored procedure name
     * @param params Query parameters to pass to the procedure
     * @returns Promise with the procedure results
     */
    public async executeProcedure(
        procedure: string, 
        params?: QueryParams
    ): Promise<unknown[][]> {
        return await this.provider.executeProcedure(procedure, params);
    }

    /**
     * Executes the requested stored procedure with provided parameters in the request body.
     * @param procedure Stored procedure name
     * @param parameters Parameters to be used for calling stored procedure
     * @returns Promise with the procedure results
     */
    public async executeProcedureWithBody(
        procedure: string, 
        parameters: Record<string, unknown>
    ): Promise<unknown[][]> {
        return await this.provider.executeProcedureWithBody(procedure, parameters);
    }

    // Communication Service Methods
    /**
     * Creates a new communication, immediately renders it and schedules for delivery.
     * Supports both simple JSON communication and multipart form data with file attachments.
     * @param communication Communication information object
     * @param attachments Optional array of file attachments
     * @returns Promise with the created communication
     */
    public async createCommunication(
        communication: CommunicationInfo,
        attachments?: File[]
    ): Promise<Communication> {
        return await this.provider.createCommunication(communication, attachments);
    }

    /**
     * Creates email messages from the provided information and immediately schedules them for delivery.
     * Supports both simple JSON message and multipart form data with file attachments.
     * @param message Message information object
     * @param attachments Optional array of file attachments
     * @returns Promise with the created communication
     */
    public async sendMessage(
        message: MessageInfo,
        attachments?: File[]
    ): Promise<Communication> {
        return await this.provider.sendMessage(message, attachments);
    }

    // File Service Methods
    /**
     * Returns the metadata (descriptions) of the files attached to the specified record.
     * @param params Object containing table name, record ID, and optional parameters
     * @returns Promise with an array of file descriptions
     */
    public async getFilesByRecord(params: {
        table: string,
        recordId: number,
        defaultOnly?: boolean
    }): Promise<FileDescription[]> {
        const { table, recordId, defaultOnly } = params;
        return await this.provider.getFilesByRecord(table, recordId, defaultOnly);
    }

    /**
     * Uploads and attaches multiple files to the specified record.
     * @param params Object containing table name, record ID, files, and optional upload parameters
     * @returns Promise with an array of uploaded file descriptions
     */
    public async uploadFiles(params: {
        table: string,
        recordId: number,
        files: File[],
        uploadParams?: FileUploadParams
    }): Promise<FileDescription[]> {
        const { table, recordId, files, uploadParams } = params;
        return await this.provider.uploadFiles(table, recordId, files, uploadParams);
    }

    /**
     * Updates the content and/or metadata of the file corresponding to provided identifier.
     * @param params Object containing file ID, optional new file content, and update parameters
     * @returns Promise with the updated file description
     */
    public async updateFile(params: {
        fileId: number,
        file?: File,
        updateParams?: FileUpdateParams
    }): Promise<FileDescription> {
        const { fileId, file, updateParams } = params;
        return await this.provider.updateFile(fileId, file, updateParams);
    }

    /**
     * Deletes the file corresponding to provided identifier.
     * @param params Object containing file ID and optional user ID for auditing
     * @returns Promise that resolves when file is deleted
     */
    public async deleteFile(params: {
        fileId: number,
        userId?: number
    }): Promise<void> {
        const { fileId, userId } = params;
        return await this.provider.deleteFile(fileId, userId);
    }

    /**
     * Returns the content of the file corresponding to provided globally unique identifier.
     * This method does NOT require authentication.
     * @param params Object containing unique file ID and optional thumbnail flag
     * @returns Promise with the file content as a Blob
     */
    public async getFileContentByUniqueId(params: {
        uniqueFileId: string,
        thumbnail?: boolean
    }): Promise<Blob> {
        const { uniqueFileId, thumbnail } = params;
        return await this.provider.getFileContentByUniqueId(uniqueFileId, thumbnail);
    }

    /**
     * Returns the file metadata (description) corresponding to provided database identifier.
     * @param params Object containing file ID
     * @returns Promise with the file description
     */
    public async getFileMetadata(params: {
        fileId: number
    }): Promise<FileDescription> {
        const { fileId } = params;
        return await this.provider.getFileMetadata(fileId);
    }

    /**
     * Returns the file metadata (description) corresponding to provided globally unique identifier.
     * @param params Object containing unique file ID
     * @returns Promise with the file description
     */
    public async getFileMetadataByUniqueId(params: {
        uniqueFileId: string
    }): Promise<FileDescription> {
        const { uniqueFileId } = params;
        return await this.provider.getFileMetadataByUniqueId(uniqueFileId);
    }
}