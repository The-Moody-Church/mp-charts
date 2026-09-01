import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRequireFeatureAccess,
  mockEnforceRateLimit,
  mockGetMpUserId,
  mockGetContactLogTypes,
  mockCreateContactLog,
  mockUpdateContactLog,
  mockDeleteContactLog,
  mockGetContactLogsByContactId,
  mockGetContactLogById,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockGetMpUserId: vi.fn(),
  mockGetContactLogTypes: vi.fn(),
  mockCreateContactLog: vi.fn(),
  mockUpdateContactLog: vi.fn(),
  mockDeleteContactLog: vi.fn(),
  mockGetContactLogsByContactId: vi.fn(),
  mockGetContactLogById: vi.fn(),
}));

vi.mock('@/lib/authorization', () => ({
  requireFeatureAccess: mockRequireFeatureAccess,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

vi.mock('@/lib/auth-helpers', () => ({
  getMpUserId: mockGetMpUserId,
}));

vi.mock('@/services/contactLogService', () => ({
  ContactLogService: {
    getInstance: vi.fn().mockResolvedValue({
      getContactLogTypes: mockGetContactLogTypes,
      createContactLog: mockCreateContactLog,
      updateContactLog: mockUpdateContactLog,
      deleteContactLog: mockDeleteContactLog,
      getContactLogsByContactId: mockGetContactLogsByContactId,
      getContactLogById: mockGetContactLogById,
    }),
  },
}));

import {
  getContactLogTypes,
  createContactLog,
  updateContactLog,
  deleteContactLog,
  getContactLogsByContactId,
  getContactLogById,
  createAutoContactLog,
} from './actions';

const mockSession = {
  user: { id: 'user-1', name: 'Test User', userGuid: 'guid-123' },
};

describe('contact-logs actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireFeatureAccess.mockResolvedValue(mockSession);
    mockGetMpUserId.mockReturnValue(99);
  });

  describe('getContactLogTypes', () => {
    it('should require feature access', async () => {
      mockGetContactLogTypes.mockResolvedValueOnce([]);
      await getContactLogTypes();
      expect(mockRequireFeatureAccess).toHaveBeenCalledWith('contact-lookup');
    });

    it('should return log types when authenticated', async () => {
      const mockTypes = [{ Contact_Log_Type_ID: 1, Contact_Log_Type: 'Email' }];
      mockGetContactLogTypes.mockResolvedValueOnce(mockTypes);

      const result = await getContactLogTypes();
      expect(result).toEqual(mockTypes);
    });

    it('should throw wrapped error on auth failure', async () => {
      mockRequireFeatureAccess.mockRejectedValueOnce(new Error('Forbidden'));
      await expect(getContactLogTypes()).rejects.toThrow('Failed to fetch contact log types');
    });
  });

  describe('createContactLog', () => {
    const validInput = {
      Contact_ID: 42,
      Contact_Date: '2024-01-15T10:00:00Z',
      Notes: 'Test note',
      Contact_Log_Type_ID: 1,
      Planned_Contact_ID: null,
      Contact_Successful: null,
      Original_Contact_Log_Entry: null,
      Feedback_Entry_ID: null,
    };

    it('should enforce write rate limit', async () => {
      mockCreateContactLog.mockResolvedValueOnce({ Contact_Log_ID: 1 });
      await createContactLog(validInput);
      expect(mockEnforceRateLimit).toHaveBeenCalledWith('user-1', 'write');
    });

    it('should add Made_By from session user', async () => {
      mockCreateContactLog.mockResolvedValueOnce({ Contact_Log_ID: 1 });
      await createContactLog(validInput);

      expect(mockCreateContactLog).toHaveBeenCalledWith(
        expect.objectContaining({
          Contact_ID: 42,
          Made_By: 99,
          Notes: 'Test note',
        })
      );
    });

    it('should throw when MP user ID is unavailable', async () => {
      mockGetMpUserId.mockReturnValueOnce(undefined);
      await expect(createContactLog(validInput)).rejects.toThrow('Failed to create contact log');
    });

    it('should throw when required fields are missing', async () => {
      await expect(
        createContactLog({
          Contact_ID: 0,
          Contact_Date: '',
          Notes: '',
          Contact_Log_Type_ID: null as unknown as number,
          Planned_Contact_ID: null,
          Contact_Successful: null,
          Original_Contact_Log_Entry: null,
          Feedback_Entry_ID: null,
        })
      ).rejects.toThrow('Failed to create contact log');
    });
  });

  describe('updateContactLog', () => {
    it('should enforce write rate limit', async () => {
      mockGetContactLogById.mockResolvedValueOnce({ Contact_Log_ID: 1, Made_By: 99 });
      mockUpdateContactLog.mockResolvedValueOnce({ Contact_Log_ID: 1 });
      await updateContactLog(1, { Notes: 'Updated' });
      expect(mockEnforceRateLimit).toHaveBeenCalledWith('user-1', 'write');
    });

    it('should throw for invalid contactLogId', async () => {
      await expect(updateContactLog(0, { Notes: 'Updated' })).rejects.toThrow('Failed to update contact log');
    });

    it('should verify ownership before updating', async () => {
      mockGetContactLogById.mockResolvedValueOnce({ Contact_Log_ID: 1, Made_By: 99 });
      mockUpdateContactLog.mockResolvedValueOnce({ Contact_Log_ID: 1, Notes: 'Updated' });

      await updateContactLog(1, { Notes: 'Updated' });

      expect(mockGetContactLogById).toHaveBeenCalledWith(1);
      expect(mockUpdateContactLog).toHaveBeenCalledWith(1, expect.objectContaining({
        Notes: 'Updated',
        Made_By: 99,
      }));
    });

    it('should throw when user does not own the log entry', async () => {
      mockGetContactLogById.mockResolvedValueOnce({ Contact_Log_ID: 1, Made_By: 42 });

      await expect(updateContactLog(1, { Notes: 'Updated' })).rejects.toThrow(
        'You can only edit contact logs that you created'
      );
    });

    it('should throw when log entry not found', async () => {
      mockGetContactLogById.mockResolvedValueOnce(null);

      await expect(updateContactLog(1, { Notes: 'Updated' })).rejects.toThrow('Failed to update contact log');
    });
  });

  describe('deleteContactLog', () => {
    it('should enforce write rate limit', async () => {
      mockGetContactLogById.mockResolvedValueOnce({ Contact_Log_ID: 1, Made_By: 99 });
      mockDeleteContactLog.mockResolvedValueOnce(undefined);
      await deleteContactLog(1);
      expect(mockEnforceRateLimit).toHaveBeenCalledWith('user-1', 'write');
    });

    it('should throw for invalid contactLogId', async () => {
      await expect(deleteContactLog(0)).rejects.toThrow('Failed to delete contact log');
    });

    it('should verify ownership before deleting', async () => {
      mockGetContactLogById.mockResolvedValueOnce({ Contact_Log_ID: 42, Made_By: 99 });
      mockDeleteContactLog.mockResolvedValueOnce(undefined);
      await deleteContactLog(42);
      expect(mockGetContactLogById).toHaveBeenCalledWith(42);
      expect(mockDeleteContactLog).toHaveBeenCalledWith(42);
    });

    it('should throw when user does not own the log entry', async () => {
      mockGetContactLogById.mockResolvedValueOnce({ Contact_Log_ID: 42, Made_By: 42 });
      await expect(deleteContactLog(42)).rejects.toThrow(
        'You can only delete contact logs that you created'
      );
      expect(mockDeleteContactLog).not.toHaveBeenCalled();
    });

    it('should throw when log entry not found', async () => {
      mockGetContactLogById.mockResolvedValueOnce(null);
      await expect(deleteContactLog(42)).rejects.toThrow('Failed to delete contact log');
      expect(mockDeleteContactLog).not.toHaveBeenCalled();
    });
  });

  describe('getContactLogsByContactId', () => {
    it('should require feature access', async () => {
      mockGetContactLogsByContactId.mockResolvedValueOnce([]);
      await getContactLogsByContactId(42);
      expect(mockRequireFeatureAccess).toHaveBeenCalledWith('contact-lookup');
    });

    it('should throw for invalid contactId', async () => {
      await expect(getContactLogsByContactId(0)).rejects.toThrow('Failed to fetch contact logs');
    });

    it('should return logs when valid', async () => {
      const mockLogs = [{ Contact_Log_ID: 1, Contact_ID: 42 }];
      mockGetContactLogsByContactId.mockResolvedValueOnce(mockLogs);

      const result = await getContactLogsByContactId(42);
      expect(result).toEqual(mockLogs);
    });
  });

  describe('getContactLogById', () => {
    it('should throw for invalid contactLogId', async () => {
      await expect(getContactLogById(0)).rejects.toThrow('Failed to fetch contact log');
    });

    it('should return log when found', async () => {
      const mockLog = { Contact_Log_ID: 1, Notes: 'Test' };
      mockGetContactLogById.mockResolvedValueOnce(mockLog);

      const result = await getContactLogById(1);
      expect(result).toEqual(mockLog);
    });

    it('should return null when not found', async () => {
      mockGetContactLogById.mockResolvedValueOnce(null);

      const result = await getContactLogById(999);
      expect(result).toBeNull();
    });
  });

  describe('createAutoContactLog', () => {
    it('should personalize notes with user name', async () => {
      mockCreateContactLog.mockResolvedValueOnce({ Contact_Log_ID: 1 });

      await createAutoContactLog(42, 1, 'User viewed the profile');

      expect(mockCreateContactLog).toHaveBeenCalledWith(
        expect.objectContaining({
          Contact_ID: 42,
          Notes: 'Test User viewed the profile',
          Made_By: 99,
        })
      );
    });

    it('should return true on success', async () => {
      mockCreateContactLog.mockResolvedValueOnce({ Contact_Log_ID: 1 });

      const result = await createAutoContactLog(42, 1, 'User viewed');
      expect(result).toBe(true);
    });

    it('should return false on failure (fire-and-forget)', async () => {
      mockCreateContactLog.mockRejectedValueOnce(new Error('API error'));

      const result = await createAutoContactLog(42, 1, 'User viewed');
      expect(result).toBe(false);
    });
  });
});

/**
 * Upstream #75 adaptation: the action boundary now routes IDs through
 * sanitizeId(). React Flight args are type-erased, so a "number" parameter can
 * arrive as an injection string — it must be rejected before any service call.
 */
describe('type-erased ID rejection (sanitizeId at the action boundary)', () => {
  beforeEach(() => {
    mockRequireFeatureAccess.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetMpUserId.mockReturnValue(77);
  });

  it('deleteContactLog rejects an injection string without touching the service', async () => {
    await expect(
      deleteContactLog('1 OR 1=1' as unknown as number)
    ).rejects.toThrow('Failed to delete contact log');
    expect(mockGetContactLogById).not.toHaveBeenCalled();
    expect(mockDeleteContactLog).not.toHaveBeenCalled();
  });

  it('updateContactLog rejects an injection string without touching the service', async () => {
    await expect(
      updateContactLog('2; DROP TABLE Contact_Log' as unknown as number, {})
    ).rejects.toThrow('Failed to update contact log');
    expect(mockUpdateContactLog).not.toHaveBeenCalled();
  });

  it('getContactLogsByContactId coerces a purely numeric string id', async () => {
    mockGetContactLogsByContactId.mockResolvedValue([]);
    await getContactLogsByContactId('42' as unknown as number);
    expect(mockGetContactLogsByContactId).toHaveBeenCalledWith(42);
  });
});
