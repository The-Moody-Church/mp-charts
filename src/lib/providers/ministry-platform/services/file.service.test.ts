import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileService } from './file.service';

const mockGet = vi.fn();
const mockPostFormData = vi.fn();
const mockPutFormData = vi.fn();
const mockDelete = vi.fn();
const mockBuildUrl = vi.fn();
const mockEnsureValidToken = vi.fn();

function createService() {
  const client = {
    ensureValidToken: mockEnsureValidToken,
    getHttpClient: () => ({
      get: mockGet,
      postFormData: mockPostFormData,
      putFormData: mockPutFormData,
      delete: mockDelete,
      buildUrl: mockBuildUrl,
    }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new FileService(client);
}

describe('FileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureValidToken.mockResolvedValue(undefined);
  });

  describe('getFilesByRecord', () => {
    it('fetches files for a record', async () => {
      const files = [{ FileId: 1, FileName: 'photo.jpg' }];
      mockGet.mockResolvedValueOnce(files);
      const service = createService();
      const result = await service.getFilesByRecord('Contacts', 42);
      expect(mockGet).toHaveBeenCalledWith('/files/Contacts/42', {});
      expect(result).toEqual(files);
    });

    // SECURITY regression: buildUrl concatenates the endpoint without encoding and
    // fetch() then normalizes dot-segments, so an unencoded `../..` here would
    // retarget the request to an arbitrary MP endpoint under the service account.
    it('percent-encodes the recordId so a traversal cannot escape /files', async () => {
      mockGet.mockResolvedValueOnce([]);
      const service = createService();
      await service.getFilesByRecord('Participant_Milestones', '../../tables/Contacts' as unknown as number);

      const endpoint = mockGet.mock.calls[0][0] as string;
      expect(endpoint).not.toContain('../');
      expect(endpoint).toBe('/files/Participant_Milestones/..%2F..%2Ftables%2FContacts');

      // The decisive check: resolving against a base must stay under /files.
      const resolved = new URL(endpoint, 'https://mp.example.com/ministryplatformapi/');
      expect(resolved.pathname.startsWith('/files/')).toBe(true);
    });

    it('percent-encodes the table segment too', async () => {
      mockGet.mockResolvedValueOnce([]);
      const service = createService();
      await service.getFilesByRecord('../../procs/Evil', 42);
      expect(mockGet.mock.calls[0][0]).toBe('/files/..%2F..%2Fprocs%2FEvil/42');
    });

    it('passes defaultOnly param', async () => {
      mockGet.mockResolvedValueOnce([]);
      const service = createService();
      await service.getFilesByRecord('Contacts', 42, true);
      expect(mockGet).toHaveBeenCalledWith('/files/Contacts/42', { $default: 'true' });
    });

    it('propagates errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Not found'));
      const service = createService();
      await expect(service.getFilesByRecord('X', 1)).rejects.toThrow('Not found');
    });
  });

  describe('uploadFiles', () => {
    it('uploads files with form data', async () => {
      const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
      const result = [{ FileId: 1 }];
      mockPostFormData.mockResolvedValueOnce(result);
      const service = createService();
      const response = await service.uploadFiles('Contacts', 42, [file]);
      expect(mockPostFormData).toHaveBeenCalledWith(
        '/files/Contacts/42',
        expect.any(FormData),
        {}
      );
      expect(response).toEqual(result);
    });

    it('passes optional upload params', async () => {
      const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
      mockPostFormData.mockResolvedValueOnce([]);
      const service = createService();
      await service.uploadFiles('Contacts', 42, [file], {
        description: 'Photo',
        isDefaultImage: true,
        longestDimension: 500,
        userId: 10,
      });
      const queryParams = mockPostFormData.mock.calls[0][2];
      expect(queryParams).toEqual({
        $description: 'Photo',
        $default: 'true',
        $longestDimension: '500',
        $userId: '10',
      });
    });

    it('propagates errors', async () => {
      mockPostFormData.mockRejectedValueOnce(new Error('Upload failed'));
      const service = createService();
      await expect(service.uploadFiles('X', 1, [])).rejects.toThrow('Upload failed');
    });
  });

  describe('updateFile', () => {
    it('updates file metadata via PUT form data', async () => {
      const result = { FileId: 1 };
      mockPutFormData.mockResolvedValueOnce(result);
      const service = createService();
      const response = await service.updateFile(1, undefined, { description: 'Updated' });
      expect(mockPutFormData).toHaveBeenCalledWith(
        '/files/1',
        expect.any(FormData),
        expect.objectContaining({ $description: 'Updated' })
      );
      expect(response).toEqual(result);
    });

    it('includes file in form data when provided', async () => {
      const file = new File(['data'], 'new.jpg', { type: 'image/jpeg' });
      mockPutFormData.mockResolvedValueOnce({ FileId: 1 });
      const service = createService();
      await service.updateFile(1, file);
      const formData = mockPutFormData.mock.calls[0][1] as FormData;
      expect(formData.has('file')).toBe(true);
    });

    it('passes all optional params', async () => {
      mockPutFormData.mockResolvedValueOnce({ FileId: 1 });
      const service = createService();
      await service.updateFile(1, undefined, {
        fileName: 'new-name.jpg',
        description: 'Desc',
        isDefaultImage: false,
        longestDimension: 300,
        userId: 5,
      });
      const queryParams = mockPutFormData.mock.calls[0][2];
      expect(queryParams).toEqual({
        $fileName: 'new-name.jpg',
        $description: 'Desc',
        $default: 'false',
        $longestDimension: '300',
        $userId: '5',
      });
    });

    it('propagates errors', async () => {
      mockPutFormData.mockRejectedValueOnce(new Error('Update failed'));
      const service = createService();
      await expect(service.updateFile(1)).rejects.toThrow('Update failed');
    });
  });

  describe('deleteFile', () => {
    it('deletes file by ID', async () => {
      mockDelete.mockResolvedValueOnce(undefined);
      const service = createService();
      await service.deleteFile(42);
      expect(mockDelete).toHaveBeenCalledWith('/files/42', {});
    });

    it('passes userId param', async () => {
      mockDelete.mockResolvedValueOnce(undefined);
      const service = createService();
      await service.deleteFile(42, 10);
      expect(mockDelete).toHaveBeenCalledWith('/files/42', { $userId: '10' });
    });

    it('propagates errors', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Delete failed'));
      const service = createService();
      await expect(service.deleteFile(1)).rejects.toThrow('Delete failed');
    });
  });

  describe('getFileContentByUniqueId', () => {
    it('fetches file content as blob', async () => {
      const blob = new Blob(['image data'], { type: 'image/jpeg' });
      mockBuildUrl.mockReturnValue('https://mp.example.com/files/abc-123');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(blob),
      }));

      const service = createService();
      const result = await service.getFileContentByUniqueId('abc-123');
      expect(result).toBe(blob);
      expect(mockBuildUrl).toHaveBeenCalledWith('/files/abc-123', {});
      vi.unstubAllGlobals();
    });

    it('passes thumbnail param', async () => {
      mockBuildUrl.mockReturnValue('https://mp.example.com/files/abc?$thumbnail=true');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      }));

      const service = createService();
      await service.getFileContentByUniqueId('abc', true);
      expect(mockBuildUrl).toHaveBeenCalledWith('/files/abc', { $thumbnail: 'true' });
      vi.unstubAllGlobals();
    });

    it('throws on non-OK response', async () => {
      mockBuildUrl.mockReturnValue('https://mp.example.com/files/bad');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));

      const service = createService();
      await expect(service.getFileContentByUniqueId('bad')).rejects.toThrow('failed: 404 Not Found');
      vi.unstubAllGlobals();
    });
  });

  describe('getFileMetadata', () => {
    it('fetches metadata by file ID', async () => {
      const meta = { FileId: 1, FileName: 'test.jpg' };
      mockGet.mockResolvedValueOnce(meta);
      const service = createService();
      const result = await service.getFileMetadata(1);
      expect(mockGet).toHaveBeenCalledWith('/files/1/metadata');
      expect(result).toEqual(meta);
    });

    it('propagates errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Not found'));
      const service = createService();
      await expect(service.getFileMetadata(999)).rejects.toThrow('Not found');
    });
  });

  describe('getFileMetadataByUniqueId', () => {
    it('fetches metadata by unique ID', async () => {
      const meta = { FileId: 1, FileName: 'test.jpg' };
      mockGet.mockResolvedValueOnce(meta);
      const service = createService();
      const result = await service.getFileMetadataByUniqueId('abc-123');
      expect(mockGet).toHaveBeenCalledWith('/files/abc-123/metadata');
      expect(result).toEqual(meta);
    });

    it('propagates errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Not found'));
      const service = createService();
      await expect(service.getFileMetadataByUniqueId('bad')).rejects.toThrow('Not found');
    });
  });
});
