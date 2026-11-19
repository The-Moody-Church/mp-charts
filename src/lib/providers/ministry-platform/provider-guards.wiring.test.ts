import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * End-to-end wiring for the batch 3 provider guards (upstream MPNext 3d9ae92):
 * the real MPHelper, provider and services, with only the MP client mocked.
 * Proves the procedure allowlist and the N21 `$ignorePermissions` strip hold
 * through every layer, not just inside each service's own unit test.
 */

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockEnsureValidToken = vi.fn();

vi.mock('./client', () => ({
  MinistryPlatformClient: class {
    ensureValidToken = mockEnsureValidToken;
    getHttpClient = () => ({ get: mockGet, post: mockPost });
  },
}));

import { MPHelper } from './helper';
import { MinistryPlatformProvider } from './provider';

describe('provider guards, wired end to end', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MinistryPlatformProvider as any).instance = undefined;
    mockEnsureValidToken.mockResolvedValue(undefined);
    mockGet.mockResolvedValue([]);
    mockPost.mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('procedure allowlist', () => {
    it('a default helper can execute no procedure at all', async () => {
      const mp = new MPHelper();
      await expect(mp.executeProcedure('api_Custom_Get_Stats')).rejects.toThrow('Procedure is not on the allowlist');
      await expect(mp.executeProcedureWithBody('api_Custom_Get_Stats', {})).rejects.toThrow(
        'Procedure is not on the allowlist'
      );
      expect(mockEnsureValidToken).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('a helper with allowedProcedures can execute exactly those names', async () => {
      const mp = new MPHelper({ allowedProcedures: ['api_Custom_Get_Stats'] });
      await mp.executeProcedure('api_Custom_Get_Stats', { a: 1 });
      await mp.executeProcedureWithBody('api_Custom_Get_Stats', { b: 2 });
      expect(mockGet).toHaveBeenCalledWith('/procs/api_Custom_Get_Stats', { a: 1 });
      expect(mockPost).toHaveBeenCalledWith('/procs/api_Custom_Get_Stats', { b: 2 });

      await expect(mp.executeProcedure('api_Custom_Delete_All')).rejects.toThrow('Procedure is not on the allowlist');
    });

    it("one helper's list never widens another's", async () => {
      const widened = new MPHelper({ allowedProcedures: ['api_Custom_Get_Stats'] });
      await widened.executeProcedure('api_Custom_Get_Stats');

      const plain = new MPHelper();
      await expect(plain.executeProcedure('api_Custom_Get_Stats')).rejects.toThrow('Procedure is not on the allowlist');
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('getProcedures (metadata only) is not gated', async () => {
      await new MPHelper().getProcedures();
      expect(mockGet).toHaveBeenCalledWith('/procs', undefined);
    });
  });

  describe('global filters (audit N21)', () => {
    it('never forwards $ignorePermissions, even when cast in', async () => {
      await new MPHelper().getGlobalFilters({ $ignorePermissions: true, $userId: 7 } as unknown as { $userId: number });
      expect(mockGet).toHaveBeenCalledWith('/domain/filters', { $userId: 7 });
    });

    it('sends no query when no $userId is given', async () => {
      await new MPHelper().getGlobalFilters({ $ignorePermissions: true } as unknown as { $userId?: number });
      expect(mockGet).toHaveBeenCalledWith('/domain/filters', undefined);
    });

    it('refuses a non-integer $userId before any request', async () => {
      await expect(
        new MPHelper().getGlobalFilters({ $userId: '1 OR 1=1' as unknown as number })
      ).rejects.toThrow('Invalid ID');
      expect(mockGet).not.toHaveBeenCalled();
    });
  });
});
