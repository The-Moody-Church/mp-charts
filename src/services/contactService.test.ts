import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactService } from '@/services/contactService';

const mockGetTableRecords = vi.fn();
const mockUpdateTableRecords = vi.fn();
const mockUploadFiles = vi.fn();

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(_opts?: any) {}
      getTableRecords = mockGetTableRecords;
      updateTableRecords = mockUpdateTableRecords;
      uploadFiles = mockUploadFiles;
    },
  };
});

vi.mock('@/lib/providers/ministry-platform/utils/filter-sanitize', () => ({
  sanitizeFilterValue: vi.fn((v: string) => v.replace(/'/g, "''")),
  sanitizeLikeValue: vi.fn((v: string) =>
    v.replace(/'/g, "''").replace(/\[/g, '[[]').replace(/%/g, '[%]').replace(/_/g, '[_]')
  ),
  sanitizeGuid: vi.fn((v: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(v)) throw new Error('Invalid GUID format');
    return v;
  }),
  sanitizeIds: vi.fn((ids: number[]) => {
    if (!ids.every(id => Number.isFinite(id) && id > 0)) throw new Error('Invalid ID');
    return ids.join(',');
  }),
}));

describe('ContactService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ContactService as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should return a singleton instance without accessToken', async () => {
      const a = await ContactService.getInstance();
      const b = await ContactService.getInstance();
      expect(a).toBe(b);
    });

    it('should return a new instance with accessToken', async () => {
      const a = await ContactService.getInstance();
      const b = await ContactService.getInstance('token-123');
      expect(a).not.toBe(b);
    });
  });

  describe('contactSearch', () => {
    it('should sanitize search input and build filter', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await ContactService.getInstance();
      await service.contactSearch("O'Brien");

      const call = mockGetTableRecords.mock.calls[0][0];
      expect(call.table).toBe('Contacts');
      // Should use sanitized value (single quote escaped)
      expect(call.filter).toContain("O''Brien");
      expect(call.filter).toContain('First_Name LIKE');
      expect(call.filter).toContain('Last_Name LIKE');
      expect(call.filter).toContain('Nickname LIKE');
      expect(call.filter).toContain('Email_Address LIKE');
      expect(call.filter).toContain('Mobile_Phone LIKE');
      expect(call.top).toBe(20);
    });

    it('should return matching contacts', async () => {
      const mockContacts = [
        { Contact_ID: 1, First_Name: 'John', Last_Name: 'Doe' },
      ];
      mockGetTableRecords.mockResolvedValueOnce(mockContacts);

      const service = await ContactService.getInstance();
      const result = await service.contactSearch('John');

      expect(result).toEqual(mockContacts);
    });

    it('should return empty array when no results', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await ContactService.getInstance();
      const result = await service.contactSearch('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('getContactByGuid', () => {
    it('should validate GUID and return contact when found', async () => {
      const mockContact = {
        Contact_ID: 1,
        Contact_GUID: '12345678-1234-1234-1234-123456789abc',
        First_Name: 'John',
      };
      mockGetTableRecords.mockResolvedValueOnce([mockContact]);

      const service = await ContactService.getInstance();
      const result = await service.getContactByGuid('12345678-1234-1234-1234-123456789abc');

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'Contacts',
          filter: "Contact_GUID = '12345678-1234-1234-1234-123456789abc'",
          top: 1,
        })
      );
      expect(result).toEqual(mockContact);
    });

    it('should return null when contact not found', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await ContactService.getInstance();
      const result = await service.getContactByGuid('12345678-1234-1234-1234-123456789abc');

      expect(result).toBeNull();
    });

    it('should throw on invalid GUID format', async () => {
      const service = await ContactService.getInstance();
      await expect(service.getContactByGuid('not-a-guid')).rejects.toThrow('Invalid GUID');
    });
  });

  describe('updateContact', () => {
    it('should update contact with correct record shape', async () => {
      mockUpdateTableRecords.mockResolvedValueOnce([]);

      const service = await ContactService.getInstance();
      await service.updateContact(42, { Email_Address: 'new@example.com' });

      expect(mockUpdateTableRecords).toHaveBeenCalledWith('Contacts', [
        { Contact_ID: 42, Email_Address: 'new@example.com' },
      ]);
    });

    it('should update multiple fields at once', async () => {
      mockUpdateTableRecords.mockResolvedValueOnce([]);

      const service = await ContactService.getInstance();
      await service.updateContact(42, {
        Email_Address: 'new@example.com',
        Mobile_Phone: '555-9999',
      });

      expect(mockUpdateTableRecords).toHaveBeenCalledWith('Contacts', [
        { Contact_ID: 42, Email_Address: 'new@example.com', Mobile_Phone: '555-9999' },
      ]);
    });

    it('should propagate errors from MPHelper', async () => {
      mockUpdateTableRecords.mockRejectedValueOnce(new Error('Update failed'));

      const service = await ContactService.getInstance();
      await expect(service.updateContact(42, { Email_Address: 'bad' })).rejects.toThrow('Update failed');
    });
  });

  describe('getHouseholdMembers', () => {
    it('should sanitize household ID and fetch members', async () => {
      const mockMembers = [
        { Contact_ID: 1, First_Name: 'John' },
        { Contact_ID: 2, First_Name: 'Jane' },
      ];
      mockGetTableRecords.mockResolvedValueOnce(mockMembers);

      const service = await ContactService.getInstance();
      const result = await service.getHouseholdMembers(100);

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'Contacts',
          filter: 'Household_ID IN (100)',
        })
      );
      expect(result).toEqual(mockMembers);
    });
  });

  describe('getAllContactsForSearch', () => {
    it('should fetch all contacts without filter', async () => {
      const allContacts = [
        { Contact_ID: 1, First_Name: 'John', Last_Name: 'Doe' },
        { Contact_ID: 2, First_Name: 'Jane', Last_Name: 'Smith' },
      ];
      mockGetTableRecords.mockResolvedValueOnce(allContacts);

      const service = await ContactService.getInstance();
      const result = await service.getAllContactsForSearch();

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'Contacts',
          select: expect.stringContaining('Contact_ID'),
        })
      );
      // Should not have a filter
      expect(mockGetTableRecords.mock.calls[0][0].filter).toBeUndefined();
      expect(result).toEqual(allContacts);
    });
  });

  describe('uploadContactPhoto', () => {
    it('should upload photo with correct params', async () => {
      mockUploadFiles.mockResolvedValueOnce([]);
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

      const service = await ContactService.getInstance();
      await service.uploadContactPhoto(42, file, 10);

      expect(mockUploadFiles).toHaveBeenCalledWith({
        table: 'Contacts',
        recordId: 42,
        files: [file],
        uploadParams: {
          description: 'Contact photo uploaded via Contact Lookup',
          isDefaultImage: true,
          userId: 10,
        },
      });
    });

    it('should work without userId', async () => {
      mockUploadFiles.mockResolvedValueOnce([]);
      const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });

      const service = await ContactService.getInstance();
      await service.uploadContactPhoto(42, file);

      expect(mockUploadFiles).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadParams: expect.objectContaining({
            userId: undefined,
          }),
        })
      );
    });
  });

  describe('getContactBadges', () => {
    // getContactBadges fires parallel queries via Promise.all, so mock call order
    // is non-deterministic. Use mockImplementation that dispatches by table name.
    function setupBadgeMocks(responses: Record<string, unknown[]>) {
      mockGetTableRecords.mockImplementation((params: { table: string; filter?: string }) => {
        const table = params.table;
        if (table === 'Participants') return Promise.resolve(responses.Participants ?? []);
        if (table === 'Groups') return Promise.resolve(responses.Groups ?? []);
        if (table === 'Group_Roles') return Promise.resolve(responses.Group_Roles ?? []);
        if (table === 'Group_Participants') {
          // Distinguish serving vs group check by filter content
          if (params.filter?.includes('Group_Role_ID')) {
            return Promise.resolve(responses.Group_Participants_Serving ?? []);
          }
          if (params.filter?.includes('Group_ID IN')) {
            return Promise.resolve(responses.Group_Participants_Group ?? []);
          }
          // Age/grade groups
          if (params.filter?.includes('Group_Type_ID')) {
            return Promise.resolve(responses.Group_Participants_AgeGrade ?? []);
          }
          return Promise.resolve([]);
        }
        if (table === 'Activity_Log') return Promise.resolve(responses.Activity_Log ?? []);
        if (table === 'Participant_Milestones') return Promise.resolve(responses.Participant_Milestones ?? []);
        return Promise.resolve([]);
      });
    }

    it('returns minimal badges when no participant record exists', async () => {
      setupBadgeMocks({ Participants: [], Activity_Log: [] });

      const service = await ContactService.getInstance();
      const badges = await service.getContactBadges(42);

      expect(badges.membershipStatus).toBeNull();
      expect(badges.inGroup).toBe(false);
      expect(badges.serving).toBe(false);
      expect(badges.lastActivity).toBeNull();
      expect(badges.ageGradeGroups).toEqual([]);
    });

    it('returns active member badges with group and serving status', async () => {
      setupBadgeMocks({
        Participants: [{
          Participant_ID: 100, Contact_ID: 42,
          Member_Status_ID: 1, Member_Status: 'Registered Member',
          Date_Joined: '2020-01-15',
        }],
        Groups: [{ Group_ID: 200 }],
        Group_Participants_Group: [{ Group_Participant_ID: 300 }],
        Group_Roles: [{ Group_Role_ID: 50 }],
        Group_Participants_Serving: [{ Group_Participant_ID: 301 }],
        Activity_Log: [{ Activity_Date: '2026-03-10' }],
      });

      const service = await ContactService.getInstance();
      const badges = await service.getContactBadges(42);

      expect(badges.membershipStatus).toBe('Registered Member');
      expect(badges.membershipStatusId).toBe(1);
      expect(badges.membershipDate).toBe('2020-01-15');
      expect(badges.inGroup).toBe(true);
      expect(badges.serving).toBe(true);
      expect(badges.lastActivity).toBe('2026-03-10');
    });

    it('returns dropped member badges with milestone date', async () => {
      setupBadgeMocks({
        Participants: [{
          Participant_ID: 100, Contact_ID: 42,
          Member_Status_ID: 5, Member_Status: 'Dropped',
          Date_Joined: null,
        }],
        Groups: [],
        Group_Roles: [],
        Activity_Log: [],
        Participant_Milestones: [{ Date_Accomplished: '2025-06-01' }],
      });

      const service = await ContactService.getInstance();
      const badges = await service.getContactBadges(42);

      expect(badges.membershipStatusId).toBe(5);
      expect(badges.membershipDate).toBe('2025-06-01');
      expect(badges.inGroup).toBe(false);
      expect(badges.serving).toBe(false);
    });

    it('returns age/grade groups for minor child', async () => {
      setupBadgeMocks({
        Participants: [{
          Participant_ID: 100, Contact_ID: 42,
          Member_Status_ID: null, Member_Status: null,
          Date_Joined: null,
        }],
        Groups: [],
        Group_Roles: [],
        Activity_Log: [],
        Group_Participants_AgeGrade: [{ Group_Name: '3rd Grade' }, { Group_Name: '8-9 Year Olds' }],
      });

      const service = await ContactService.getInstance();
      const badges = await service.getContactBadges(42, 2); // 2 = Minor Child

      expect(badges.ageGradeGroups).toEqual(['3rd Grade', '8-9 Year Olds']);
    });

    it('handles no serving roles found', async () => {
      setupBadgeMocks({
        Participants: [{
          Participant_ID: 100, Contact_ID: 42,
          Member_Status_ID: 1, Member_Status: 'Registered Member',
          Date_Joined: '2020-01-15',
        }],
        Groups: [{ Group_ID: 200 }],
        Group_Participants_Group: [{ Group_Participant_ID: 300 }],
        Group_Roles: [],
        Activity_Log: [],
      });

      const service = await ContactService.getInstance();
      const badges = await service.getContactBadges(42);

      expect(badges.inGroup).toBe(true);
      expect(badges.serving).toBe(false);
    });
  });

  describe('getContactGroupMemberships', () => {
    it('returns empty array when contact has no participant record', async () => {
      mockGetTableRecords.mockImplementation((params: { table: string }) => {
        if (params.table === 'Participants') return Promise.resolve([]);
        return Promise.resolve([]);
      });

      const service = await ContactService.getInstance();
      const result = await service.getContactGroupMemberships(42);

      expect(result).toEqual([]);
      // Should not query Group_Participants when there's no Participant
      const calls = mockGetTableRecords.mock.calls.map(c => c[0].table);
      expect(calls).toEqual(['Participants']);
    });

    it('queries Group_Participants for active memberships and returns the records', async () => {
      const memberships = [
        {
          Group_Participant_ID: 1, Group_ID: 100, Group_Name: 'Tuesday Small Group',
          Group_Type_ID: 1, Group_Type: 'Small Group',
          Group_Role_ID: 2, Role: 'Member',
          Start_Date: '2025-01-01', End_Date: null,
        },
        {
          Group_Participant_ID: 2, Group_ID: 200, Group_Name: 'Worship Team',
          Group_Type_ID: 2, Group_Type: 'Ministry',
          Group_Role_ID: 16, Role: 'Servant',
          Start_Date: '2024-09-01', End_Date: null,
        },
      ];

      mockGetTableRecords.mockImplementation((params: { table: string }) => {
        if (params.table === 'Participants') return Promise.resolve([{ Participant_ID: 999 }]);
        if (params.table === 'Group_Participants') return Promise.resolve(memberships);
        return Promise.resolve([]);
      });

      const service = await ContactService.getInstance();
      const result = await service.getContactGroupMemberships(42);

      expect(result).toEqual(memberships);

      // Verify the Group_Participants query filters by participant + active dates on both
      // Group_Participants and the parent Group.
      const gpCall = mockGetTableRecords.mock.calls.find(c => c[0].table === 'Group_Participants');
      expect(gpCall).toBeDefined();
      expect(gpCall![0].filter).toContain('Participant_ID IN (999)');
      expect(gpCall![0].filter).toContain('Group_Participants.[Start_Date]');
      expect(gpCall![0].filter).toContain('Group_ID_Table.[Start_Date]');
    });
  });
});
