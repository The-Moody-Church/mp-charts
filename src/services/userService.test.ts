import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '@/services/userService';

const mockGetTableRecords = vi.fn();

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class MockMPHelper {
      getTableRecords = mockGetTableRecords;
    },
  };
});

const mockProfile = {
  User_ID: 42,
  User_GUID: '12345678-1234-1234-1234-123456789abc',
  Contact_ID: 100,
  First_Name: 'John',
  Nickname: 'Johnny',
  Last_Name: 'Doe',
  Email_Address: 'john@example.com',
  Mobile_Phone: '555-1234',
  Image_GUID: 'img-guid-123',
};

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton between tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (UserService as any).instance = undefined;
    // Flush profile cache between tests
    UserService.flushProfileCache();
  });

  describe('getInstance', () => {
    it('should return a singleton instance without accessToken', async () => {
      const a = await UserService.getInstance();
      const b = await UserService.getInstance();
      expect(a).toBe(b);
    });

    it('should return a new instance with accessToken', async () => {
      const a = await UserService.getInstance();
      const b = await UserService.getInstance('token-123');
      expect(a).not.toBe(b);
    });
  });

  describe('getUserProfile', () => {
    const groups = [
      { User_Group_ID: 29, User_Group_Name: 'Editors' },
      { User_Group_ID: 45, User_Group_Name: 'Volunteers' },
    ];

    it('should return the profile with groups and group IDs', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([mockProfile])
        .mockResolvedValueOnce(groups);

      const service = await UserService.getInstance();
      const result = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');

      expect(result).toEqual({
        ...mockProfile,
        userGroups: ['Editors', 'Volunteers'],
        userGroupIds: [29, 45],
      });
      expect(result).not.toHaveProperty('roles');

      // Verify user profile query includes User_ID in select
      expect(mockGetTableRecords.mock.calls[0][0]).toMatchObject({
        table: 'dp_Users',
        top: 1,
      });
      const selectArg = mockGetTableRecords.mock.calls[0][0].select;
      expect(selectArg).toContain('User_ID');

      // Verify groups query selects User_Group_ID
      expect(mockGetTableRecords.mock.calls[1][0]).toMatchObject({
        table: 'dp_User_User_Groups',
      });
      const groupSelect = mockGetTableRecords.mock.calls[1][0].select;
      expect(groupSelect).toContain('User_Group_ID');
    });

    it('queries only dp_Users and dp_User_User_Groups (no dp_User_Roles read, upstream 0670531)', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([mockProfile])
        .mockResolvedValueOnce(groups);

      const service = await UserService.getInstance();
      await service.getUserProfile('12345678-1234-1234-1234-123456789abc');

      const tables = mockGetTableRecords.mock.calls.map((call) => call[0].table);
      expect(tables).toEqual(['dp_Users', 'dp_User_User_Groups']);
    });

    it('should return empty groups and group IDs when none exist', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([mockProfile])
        .mockResolvedValueOnce([]);

      const service = await UserService.getInstance();
      const result = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');

      expect(result).toEqual({
        ...mockProfile,
        userGroups: [],
        userGroupIds: [],
      });
    });

    it('should return undefined when user not found', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await UserService.getInstance();
      const result = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');

      expect(result).toBeUndefined();
      // Should not make the groups query
      expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid GUIDs', async () => {
      const service = await UserService.getInstance();
      await expect(service.getUserProfile('not-a-guid')).rejects.toThrow();
      expect(mockGetTableRecords).not.toHaveBeenCalled();
    });

    it('should return cached profile on subsequent calls', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([mockProfile])
        .mockResolvedValueOnce([groups[0]]);

      const service = await UserService.getInstance();
      const first = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');
      const second = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');

      expect(first).toEqual(second);
      // Only 2 API calls (first fetch), not 4 (cached on second)
      expect(mockGetTableRecords).toHaveBeenCalledTimes(2);
    });

    it('should refetch after cache flush', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([mockProfile])
        .mockResolvedValueOnce([groups[0]])
        // Second fetch after flush
        .mockResolvedValueOnce([mockProfile])
        .mockResolvedValueOnce(groups);

      const service = await UserService.getInstance();
      const first = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');
      expect(first?.userGroupIds).toEqual([29]);

      UserService.flushProfileCache();

      const second = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');
      expect(second?.userGroupIds).toEqual([29, 45]);
      expect(mockGetTableRecords).toHaveBeenCalledTimes(4);
    });
  });
});
