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
    it('should return profile with roles and groups', async () => {
      mockGetTableRecords
        // First call: user profile
        .mockResolvedValueOnce([mockProfile])
        // Second call (Promise.all): roles
        .mockResolvedValueOnce([
          { Role_Name: 'Admin' },
          { Role_Name: 'Staff' },
        ])
        // Third call (Promise.all): groups
        .mockResolvedValueOnce([
          { User_Group_Name: 'Editors' },
        ]);

      const service = await UserService.getInstance();
      const result = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');

      expect(result).toEqual({
        ...mockProfile,
        roles: ['Admin', 'Staff'],
        userGroups: ['Editors'],
      });

      // Verify 3 API calls were made
      expect(mockGetTableRecords).toHaveBeenCalledTimes(3);

      // Verify user profile query includes User_ID in select
      expect(mockGetTableRecords.mock.calls[0][0]).toMatchObject({
        table: 'dp_Users',
        top: 1,
      });
      const selectArg = mockGetTableRecords.mock.calls[0][0].select;
      expect(selectArg).toContain('User_ID');

      // Verify roles query
      expect(mockGetTableRecords.mock.calls[1][0]).toMatchObject({
        table: 'dp_User_Roles',
      });

      // Verify groups query
      expect(mockGetTableRecords.mock.calls[2][0]).toMatchObject({
        table: 'dp_User_User_Groups',
      });
    });

    it('should return empty roles and groups when none exist', async () => {
      mockGetTableRecords
        .mockResolvedValueOnce([mockProfile])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const service = await UserService.getInstance();
      const result = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');

      expect(result).toEqual({
        ...mockProfile,
        roles: [],
        userGroups: [],
      });
    });

    it('should return undefined when user not found', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await UserService.getInstance();
      const result = await service.getUserProfile('12345678-1234-1234-1234-123456789abc');

      expect(result).toBeUndefined();
      // Should not make roles/groups queries
      expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid GUIDs', async () => {
      const service = await UserService.getInstance();
      await expect(service.getUserProfile('not-a-guid')).rejects.toThrow();
      expect(mockGetTableRecords).not.toHaveBeenCalled();
    });
  });
});
