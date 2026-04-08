import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcedureService } from './procedure.service';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockEnsureValidToken = vi.fn();

function createService() {
  const client = {
    ensureValidToken: mockEnsureValidToken,
    getHttpClient: () => ({ get: mockGet, post: mockPost }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new ProcedureService(client);
}

describe('ProcedureService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureValidToken.mockResolvedValue(undefined);
  });

  describe('getProcedures', () => {
    it('fetches procedure list without search', async () => {
      const procs = [{ Name: 'proc1' }];
      mockGet.mockResolvedValueOnce(procs);
      const service = createService();
      const result = await service.getProcedures();
      expect(mockGet).toHaveBeenCalledWith('/procs', undefined);
      expect(result).toEqual(procs);
    });

    it('passes search param when provided', async () => {
      mockGet.mockResolvedValueOnce([]);
      const service = createService();
      await service.getProcedures('test');
      expect(mockGet).toHaveBeenCalledWith('/procs', { $search: 'test' });
    });

    it('ensures valid token before request', async () => {
      mockGet.mockResolvedValueOnce([]);
      const service = createService();
      await service.getProcedures();
      expect(mockEnsureValidToken).toHaveBeenCalled();
    });

    it('propagates errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network error'));
      const service = createService();
      await expect(service.getProcedures()).rejects.toThrow('Network error');
    });
  });

  describe('executeProcedure', () => {
    it('executes procedure via GET with encoded name', async () => {
      const data = [[{ col: 'val' }]];
      mockGet.mockResolvedValueOnce(data);
      const service = createService();
      const result = await service.executeProcedure('My Proc', { param1: 'val' });
      expect(mockGet).toHaveBeenCalledWith('/procs/My%20Proc', { param1: 'val' });
      expect(result).toEqual(data);
    });

    it('works without params', async () => {
      mockGet.mockResolvedValueOnce([]);
      const service = createService();
      await service.executeProcedure('TestProc');
      expect(mockGet).toHaveBeenCalledWith('/procs/TestProc', undefined);
    });

    it('propagates errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Proc failed'));
      const service = createService();
      await expect(service.executeProcedure('bad')).rejects.toThrow('Proc failed');
    });
  });

  describe('executeProcedureWithBody', () => {
    it('executes procedure via POST with body', async () => {
      const data = [[{ result: 1 }]];
      mockPost.mockResolvedValueOnce(data);
      const service = createService();
      const result = await service.executeProcedureWithBody('WriteProc', { key: 'value' });
      expect(mockPost).toHaveBeenCalledWith('/procs/WriteProc', { key: 'value' });
      expect(result).toEqual(data);
    });

    it('propagates errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('Write failed'));
      const service = createService();
      await expect(service.executeProcedureWithBody('bad', {})).rejects.toThrow('Write failed');
    });
  });
});
