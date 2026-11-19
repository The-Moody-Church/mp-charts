import { errorForLog } from "@/lib/log-safe";
import { MinistryPlatformClient } from "../client";
import { FileDescription, FileUpdateParams, FileUploadParams } from "../types";
import { sanitizeGuid, sanitizeId } from "../utils/filter-sanitize";
import { MP_API_TIMEOUT_MS } from "../utils/timeouts";
import { sanitizeIdentifier } from "./guards";

/*
 * Path segments for the `/files` endpoints (upstream MPNext 41bba94). Each value
 * is validated for its shape (identifier / positive integer / GUID) and then
 * encoded, so a caller cannot aim the service bearer at another MP path with
 * `..`, `/`, `?` or `#`. They run before any token or network work and throw a
 * fixed message that never echoes the input. Log lines below are fixed text plus
 * errorForLog(error).
 */
function tableSegment(table: unknown): string {
    return encodeURIComponent(sanitizeIdentifier(table, 'table name'));
}

function idSegment(id: unknown): string {
    return encodeURIComponent(String(sanitizeId(id)));
}

function guidSegment(uniqueFileId: unknown): string {
    if (typeof uniqueFileId !== 'string') {
        throw new Error('Invalid GUID format');
    }
    return encodeURIComponent(sanitizeGuid(uniqueFileId));
}

export class FileService {
    private client: MinistryPlatformClient;

    constructor(client: MinistryPlatformClient) {
        this.client = client;
    }

    /**
     * Returns the metadata (descriptions) of the files attached to the specified record.
     */
    public async getFilesByRecord(
        table: string,
        recordId: number,
        defaultOnly?: boolean
    ): Promise<FileDescription[]> {
        const endpoint = `/files/${tableSegment(table)}/${idSegment(recordId)}`;
        try {
            await this.client.ensureValidToken();

            const queryParams: Record<string, string> = {};
            if (defaultOnly !== undefined) {
                queryParams['$default'] = defaultOnly.toString();
            }

            // SECURITY: `buildUrl` concatenates the endpoint onto the base URL, and
            // fetch() runs the result through the WHATWG URL parser, which
            // NORMALIZES dot-segments, so an unchecked `../..` would retarget the
            // request under the service account. The segments are validated and
            // encoded above, and HttpClient refuses dot-segments as a second net.
            return await this.client.getHttpClient().get<FileDescription[]>(endpoint, queryParams);
        } catch (error) {
            console.error('Error getting files by record:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Uploads and attaches multiple files to the specified record.
     */
    public async uploadFiles(
        table: string,
        recordId: number,
        files: File[],
        params?: FileUploadParams
    ): Promise<FileDescription[]> {
        const endpoint = `/files/${tableSegment(table)}/${idSegment(recordId)}`;
        try {
            await this.client.ensureValidToken();

            const formData = new FormData();
            
            files.forEach((file, index) => {
                formData.append(`file-${index}`, file, file.name);
            });

            // Add optional parameters to form data if provided
            if (params?.description) {
                formData.append('description', params.description);
            }
            if (params?.isDefaultImage !== undefined) {
                formData.append('isDefaultImage', params.isDefaultImage.toString());
            }
            if (params?.longestDimension) {
                formData.append('longestDimension', params.longestDimension.toString());
            }

            const queryParams: Record<string, string> = {};
            if (params?.description) queryParams['$description'] = params.description;
            if (params?.isDefaultImage !== undefined) queryParams['$default'] = params.isDefaultImage.toString();
            if (params?.longestDimension) queryParams['$longestDimension'] = params.longestDimension.toString();
            if (params?.userId) queryParams['$userId'] = params.userId.toString();

            return await this.client.getHttpClient().postFormData<FileDescription[]>(
                endpoint,
                formData,
                queryParams
            );
        } catch (error) {
            console.error('Error uploading files:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Updates the content and/or metadata of the file corresponding to provided identifier.
     */
    public async updateFile(
        fileId: number,
        file?: File,
        params?: FileUpdateParams
    ): Promise<FileDescription> {
        const endpoint = `/files/${idSegment(fileId)}`;
        try {
            await this.client.ensureValidToken();

            const formData = new FormData();
            
            if (file) {
                formData.append('file', file, file.name);
            }

            // Add optional parameters to form data if provided
            if (params?.fileName) {
                formData.append('fileName', params.fileName);
            }
            if (params?.description) {
                formData.append('description', params.description);
            }
            if (params?.isDefaultImage !== undefined) {
                formData.append('isDefaultImage', params.isDefaultImage.toString());
            }
            if (params?.longestDimension) {
                formData.append('longestDimension', params.longestDimension.toString());
            }

            const queryParams: Record<string, string> = {};
            if (params?.fileName) queryParams['$fileName'] = params.fileName;
            if (params?.description) queryParams['$description'] = params.description;
            if (params?.isDefaultImage !== undefined) queryParams['$default'] = params.isDefaultImage.toString();
            if (params?.longestDimension) queryParams['$longestDimension'] = params.longestDimension.toString();
            if (params?.userId) queryParams['$userId'] = params.userId.toString();

            return await this.client.getHttpClient().putFormData<FileDescription>(
                endpoint,
                formData,
                queryParams
            );
        } catch (error) {
            console.error('Error updating file:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Deletes the file corresponding to provided identifier.
     */
    public async deleteFile(
        fileId: number,
        userId?: number
    ): Promise<void> {
        const endpoint = `/files/${idSegment(fileId)}`;
        try {
            await this.client.ensureValidToken();

            const queryParams: Record<string, string> = {};
            if (userId) {
                queryParams['$userId'] = userId.toString();
            }

            await this.client.getHttpClient().delete<void>(endpoint, queryParams);
        } catch (error) {
            console.error('Error deleting file:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Returns the content of the file corresponding to provided globally unique identifier.
     * This method does NOT require authentication.
     */
    public async getFileContentByUniqueId(
        uniqueFileId: string,
        thumbnail?: boolean
    ): Promise<Blob> {
        // MP serves /files/{uniqueId} without authentication, so the ID is a
        // download capability: validated here and never echoed in a message.
        const endpoint = `/files/${guidSegment(uniqueFileId)}`;
        try {
            const queryParams: Record<string, string> = {};
            if (thumbnail !== undefined) {
                queryParams['$thumbnail'] = thumbnail.toString();
            }

            const url = this.client.getHttpClient().buildUrl(endpoint, queryParams);

            const response = await fetch(url, {
                method: 'GET',
                // No authorization header needed for this endpoint
                redirect: 'error',
                signal: AbortSignal.timeout(MP_API_TIMEOUT_MS),
            });

            if (!response.ok) {
                throw new Error(`GET /files/{uniqueId} failed: ${response.status} ${response.statusText}`);
            }

            return await response.blob();
        } catch (error) {
            console.error('Error getting file content by unique ID:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Returns the file metadata (description) corresponding to provided database identifier.
     */
    public async getFileMetadata(fileId: number): Promise<FileDescription> {
        const endpoint = `/files/${idSegment(fileId)}/metadata`;
        try {
            await this.client.ensureValidToken();

            return await this.client.getHttpClient().get<FileDescription>(endpoint);
        } catch (error) {
            console.error('Error getting file metadata:', errorForLog(error));
            throw error;
        }
    }

    /**
     * Returns the file metadata (description) corresponding to provided globally unique identifier.
     */
    public async getFileMetadataByUniqueId(uniqueFileId: string): Promise<FileDescription> {
        const endpoint = `/files/${guidSegment(uniqueFileId)}/metadata`;
        try {
            await this.client.ensureValidToken();

            return await this.client.getHttpClient().get<FileDescription>(endpoint);
        } catch (error) {
            console.error('Error getting file metadata by unique ID:', errorForLog(error));
            throw error;
        }
    }
}