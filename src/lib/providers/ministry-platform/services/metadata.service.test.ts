import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataService } from './metadata.service';

const mockGet = vi.fn();
const mockEnsureValidToken = vi.fn();

function createService() {
  const client = {
    ensureValidToken: mockEnsureValidToken,
    getHttpClient: () => ({ get: mockGet }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new MetadataService(client);
}

describe('MetadataService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureValidToken.mockResolvedValue(undefined);
  });

  describe('refreshMetadata', () => {
    it('calls the refresh endpoint', async () => {
      mockGet.mockResolvedValueOnce(undefined);
      const service = createService();
      await service.refreshMetadata();
      expect(mockGet).toHaveBeenCalledWith('/refreshMetadata');
    });

    it('ensures valid token first', async () => {
      mockGet.mockResolvedValueOnce(undefined);
      const service = createService();
      await service.refreshMetadata();
      expect(mockEnsureValidToken).toHaveBeenCalled();
    });

    it('propagates errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Server error'));
      const service = createService();
      await expect(service.refreshMetadata()).rejects.toThrow('Server error');
    });
  });

  describe('getTables', () => {
    it('fetches tables without search', async () => {
      const tables = [{ Name: 'Contacts' }];
      mockGet.mockResolvedValueOnce(tables);
      const service = createService();
      const result = await service.getTables();
      expect(mockGet).toHaveBeenCalledWith('/tables', undefined);
      expect(result).toEqual(tables);
    });

    it('passes search param when provided', async () => {
      mockGet.mockResolvedValueOnce([]);
      const service = createService();
      await service.getTables('Contact');
      expect(mockGet).toHaveBeenCalledWith('/tables', { $search: 'Contact' });
    });

    it('propagates errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Fetch failed'));
      const service = createService();
      await expect(service.getTables()).rejects.toThrow('Fetch failed');
    });
  });
});
