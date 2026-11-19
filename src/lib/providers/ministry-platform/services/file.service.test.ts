import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileService } from './file.service';

const mockGet = vi.fn();
const mockPostFormData = vi.fn();
const mockPutFormData = vi.fn();
const mockDelete = vi.fn();
const mockBuildUrl = vi.fn();
const mockEnsureValidToken = vi.fn();

const GUID = '0f8fad5b-d9cb-469f-a165-70867728950e';

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
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    // fetch() then normalizes dot-segments, so an unchecked `../..` here would
    // retarget the request to an arbitrary MP endpoint under the service account.
    // Since batch 3 the segment is validated and refused, before any token work.
    it('refuses a traversal recordId before any request', async () => {
      const service = createService();
      await expect(
        service.getFilesByRecord('Participant_Milestones', '../../tables/Contacts' as unknown as number)
      ).rejects.toThrow('Invalid ID');
      expect(mockEnsureValidToken).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('refuses a traversal table segment too', async () => {
      const service = createService();
      await expect(service.getFilesByRecord('../../procs/Evil', 42)).rejects.toThrow('Invalid table name');
      expect(mockGet).not.toHaveBeenCalled();
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
      await expect(service.getFilesByRecord('Contacts', 1)).rejects.toThrow('Not found');
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
      await expect(service.uploadFiles('Contacts', 1, [])).rejects.toThrow('Upload failed');
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
    it('fetches file content as blob, refusing redirects with the API timeout', async () => {
      const blob = new Blob(['image data'], { type: 'image/jpeg' });
      mockBuildUrl.mockReturnValue(`https://mp.example.com/files/${GUID}`);
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(blob),
      }));

      const service = createService();
      const result = await service.getFileContentByUniqueId(GUID);
      expect(result).toBe(blob);
      expect(mockBuildUrl).toHaveBeenCalledWith(`/files/${GUID}`, {});
      expect(fetch).toHaveBeenCalledWith(`https://mp.example.com/files/${GUID}`, {
        method: 'GET',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      });
      expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    });

    it('passes thumbnail param', async () => {
      mockBuildUrl.mockReturnValue(`https://mp.example.com/files/${GUID}?$thumbnail=true`);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      }));

      const service = createService();
      await service.getFileContentByUniqueId(GUID, true);
      expect(mockBuildUrl).toHaveBeenCalledWith(`/files/${GUID}`, { $thumbnail: 'true' });
    });

    it('throws on non-OK response without echoing the unique ID', async () => {
      mockBuildUrl.mockReturnValue(`https://mp.example.com/files/${GUID}`);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }));

      const service = createService();
      const error = await service.getFileContentByUniqueId(GUID).catch((e: Error) => e);
      expect((error as Error).message).toBe('GET /files/{uniqueId} failed: 404 Not Found');
      expect((error as Error).message).not.toContain(GUID);
    });

    it.each([
      ['a short id', 'abc-123'],
      ['a traversal', '../procs/Evil'],
      ['a GUID with a suffix', `${GUID}/metadata`],
      ['a non-string', 42],
    ])('refuses %s before any fetch', async (_label, id) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const service = createService();
      await expect(service.getFileContentByUniqueId(id as string)).rejects.toThrow('Invalid GUID format');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockBuildUrl).not.toHaveBeenCalled();
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
      const result = await service.getFileMetadataByUniqueId(GUID);
      expect(mockGet).toHaveBeenCalledWith(`/files/${GUID}/metadata`);
      expect(result).toEqual(meta);
    });

    it('propagates errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Not found'));
      const service = createService();
      await expect(service.getFileMetadataByUniqueId(GUID)).rejects.toThrow('Not found');
    });
  });

  // Batch 3 (upstream MPNext 41bba94): every path segment is validated for its
  // shape and encoded, before any token or network work.
  describe('path segment guards', () => {
    it('encodes valid segments (uploadFiles used to interpolate them raw)', async () => {
      mockPostFormData.mockResolvedValueOnce([]);
      const service = createService();
      await service.uploadFiles('Participant_Milestones', '17' as unknown as number, []);
      expect(mockPostFormData.mock.calls[0][0]).toBe('/files/Participant_Milestones/17');
    });

    it.each([
      ['getFilesByRecord table', (s: FileService) => s.getFilesByRecord('Contacts/..', 1), 'Invalid table name'],
      ['getFilesByRecord id', (s: FileService) => s.getFilesByRecord('Contacts', 1.5), 'Invalid ID'],
      ['uploadFiles table', (s: FileService) => s.uploadFiles('../procs/x', 1, []), 'Invalid table name'],
      ['uploadFiles id', (s: FileService) => s.uploadFiles('Contacts', '../1' as unknown as number, []), 'Invalid ID'],
      ['updateFile id', (s: FileService) => s.updateFile('1/../2' as unknown as number), 'Invalid ID'],
      ['deleteFile id', (s: FileService) => s.deleteFile(0), 'Invalid ID'],
      ['getFileMetadata id', (s: FileService) => s.getFileMetadata(-1), 'Invalid ID'],
      ['getFileMetadataByUniqueId guid', (s: FileService) => s.getFileMetadataByUniqueId('../x'), 'Invalid GUID format'],
    ])('%s: refuses a bad value before any request', async (_label, call, message) => {
      const service = createService();
      await expect(call(service)).rejects.toThrow(message);
      expect(mockEnsureValidToken).not.toHaveBeenCalled();
      for (const fn of [mockGet, mockPostFormData, mockPutFormData, mockDelete]) {
        expect(fn).not.toHaveBeenCalled();
      }
    });

    it('logs failures through errorForLog, not the raw error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockRejectedValueOnce(new Error('x\nforged'));
      const service = createService();
      await service.getFileMetadata(5).catch(() => {});
      expect(errorSpy).toHaveBeenCalledWith('Error getting file metadata:', 'Error: xforged');
    });
  });
});
