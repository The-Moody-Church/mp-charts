import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ALLOWED_PROCEDURES, ProcedureService } from './procedure.service';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockEnsureValidToken = vi.fn();

function createService(allowedProcedures?: string[]) {
  const client = {
    ensureValidToken: mockEnsureValidToken,
    getHttpClient: () => ({ get: mockGet, post: mockPost }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return new ProcedureService(client, allowedProcedures ? { allowedProcedures } : undefined);
}

// Procedures the execute tests enable through the per-instance allowlist.
const TEST_PROCS = ['TestProc', 'WriteProc', 'bad', 'api_Custom_Get_Stats'];

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
    it('executes an allowlisted procedure via GET with the encoded name', async () => {
      const data = [[{ col: 'val' }]];
      mockGet.mockResolvedValueOnce(data);
      const service = createService(TEST_PROCS);
      const result = await service.executeProcedure('api_Custom_Get_Stats', { param1: 'val' });
      expect(mockGet).toHaveBeenCalledWith('/procs/api_Custom_Get_Stats', { param1: 'val' });
      expect(result).toEqual(data);
    });

    it('works without params', async () => {
      mockGet.mockResolvedValueOnce([]);
      const service = createService(TEST_PROCS);
      await service.executeProcedure('TestProc');
      expect(mockGet).toHaveBeenCalledWith('/procs/TestProc', undefined);
    });

    it('propagates errors', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockRejectedValueOnce(new Error('Proc failed'));
      const service = createService(TEST_PROCS);
      await expect(service.executeProcedure('bad')).rejects.toThrow('Proc failed');
    });
  });

  describe('executeProcedureWithBody', () => {
    it('executes an allowlisted procedure via POST with body', async () => {
      const data = [[{ result: 1 }]];
      mockPost.mockResolvedValueOnce(data);
      const service = createService(TEST_PROCS);
      const result = await service.executeProcedureWithBody('WriteProc', { key: 'value' });
      expect(mockPost).toHaveBeenCalledWith('/procs/WriteProc', { key: 'value' });
      expect(result).toEqual(data);
    });

    it('propagates errors', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPost.mockRejectedValueOnce(new Error('Write failed'));
      const service = createService(TEST_PROCS);
      await expect(service.executeProcedureWithBody('bad', {})).rejects.toThrow('Write failed');
    });
  });

  // Batch 3 (upstream MPNext 41bba94 + 3d9ae92): deny-all by default.
  describe('procedure allowlist', () => {
    it('ships empty: mp-charts calls no procedures', () => {
      expect(ALLOWED_PROCEDURES).toEqual([]);
      expect(Object.isFrozen(ALLOWED_PROCEDURES)).toBe(true);
    });

    it.each(['executeProcedure', 'executeProcedureWithBody'] as const)(
      '%s refuses every name by default, before any token or network work',
      async (method) => {
        const service = createService();
        const call =
          method === 'executeProcedure'
            ? service.executeProcedure('api_Custom_Get_Stats')
            : service.executeProcedureWithBody('api_Custom_Get_Stats', {});
        await expect(call).rejects.toThrow('Procedure is not on the allowlist');
        expect(mockEnsureValidToken).not.toHaveBeenCalled();
        expect(mockGet).not.toHaveBeenCalled();
        expect(mockPost).not.toHaveBeenCalled();
      }
    );

    it('admits only the listed names, matched exactly (case-sensitive)', async () => {
      mockGet.mockResolvedValue([]);
      const service = createService(['api_Custom_Get_Stats']);
      await service.executeProcedure('api_Custom_Get_Stats');
      await expect(service.executeProcedure('API_CUSTOM_GET_STATS')).rejects.toThrow('Procedure is not on the allowlist');
      await expect(service.executeProcedure('api_Custom_Get_Other')).rejects.toThrow('Procedure is not on the allowlist');
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a traversal', '../tables/Contacts'],
      ['a dot-segment', '..'],
      ['a space', 'My Proc'],
      ['a slash', 'a/b'],
      ['a non-string', 42],
    ])('refuses %s as not an identifier, even if "listed"', async (_label, name) => {
      const service = createService(['..', 'My Proc', 'a/b', '../tables/Contacts']);
      await expect(service.executeProcedure(name as string)).rejects.toThrow('Invalid procedure name');
      expect(mockEnsureValidToken).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('never echoes the refused name, and logs without the name', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const service = createService(TEST_PROCS);
      const refused = await service.executeProcedure('Secret_Proc').catch((e: Error) => e);
      expect((refused as Error).message).not.toContain('Secret_Proc');

      mockGet.mockRejectedValueOnce(new Error('boom\nforged'));
      await service.executeProcedure('TestProc').catch(() => {});
      expect(errorSpy).toHaveBeenCalledWith('Error executing procedure:', 'Error: boomforged');
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('TestProc');
    });
  });
});
