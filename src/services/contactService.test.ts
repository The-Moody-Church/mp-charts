import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactService } from '@/services/contactService';

const mockGetTableRecords = vi.fn();
const mockUpdateTableRecords = vi.fn();
const mockUploadFiles = vi.fn();

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      getTableRecords = mockGetTableRecords;
      updateTableRecords = mockUpdateTableRecords;
      uploadFiles = mockUploadFiles;
    },
  };
});

vi.mock('@/lib/providers/ministry-platform/utils/filter-sanitize', () => ({
  sanitizeFilterValue: vi.fn((v: string) => v.replace(/'/g, "''")),
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
});
