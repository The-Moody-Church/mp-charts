import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactLogService } from '@/services/contactLogService';

const mockGetTableRecords = vi.fn();
const mockCreateTableRecords = vi.fn();
const mockUpdateTableRecords = vi.fn();
const mockDeleteTableRecords = vi.fn();

vi.mock('@/lib/providers/ministry-platform', () => {
  return {
    MPHelper: class {
      getTableRecords = mockGetTableRecords;
      createTableRecords = mockCreateTableRecords;
      updateTableRecords = mockUpdateTableRecords;
      deleteTableRecords = mockDeleteTableRecords;
    },
  };
});

describe('ContactLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ContactLogService as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should return a singleton instance', async () => {
      const a = await ContactLogService.getInstance();
      const b = await ContactLogService.getInstance();
      expect(a).toBe(b);
    });

    it('should return a new instance with accessToken', async () => {
      const a = await ContactLogService.getInstance();
      const b = await ContactLogService.getInstance('token-123');
      expect(a).not.toBe(b);
    });
  });

  describe('getContactLogTypes', () => {
    it('should fetch types with correct parameters', async () => {
      const mockTypes = [
        { Contact_Log_Type_ID: 1, Contact_Log_Type: 'Email', Description: 'Email contact' },
      ];
      mockGetTableRecords.mockResolvedValueOnce(mockTypes);

      const service = await ContactLogService.getInstance();
      const result = await service.getContactLogTypes();

      expect(mockGetTableRecords).toHaveBeenCalledWith({
        table: 'Contact_Log_Types',
        select: 'Contact_Log_Type_ID,Contact_Log_Type,Description',
        top: 100,
        orderBy: 'Contact_Log_Type',
      });
      expect(result).toEqual(mockTypes);
    });
  });

  describe('searchContactLogs', () => {
    it('should search with contactId filter when provided', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await ContactLogService.getInstance();
      await service.searchContactLogs(42);

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'Contact_Log',
          filter: 'Contact_ID = 42',
          top: 50,
          orderBy: 'Contact_Date DESC',
        })
      );
    });

    it('should search with empty filter when no contactId', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await ContactLogService.getInstance();
      await service.searchContactLogs();

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({ filter: '' })
      );
    });

    it('should respect custom limit', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await ContactLogService.getInstance();
      await service.searchContactLogs(42, 10);

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({ top: 10 })
      );
    });
  });

  describe('getContactLogById', () => {
    it('should return contact log when found', async () => {
      const mockLog = { Contact_Log_ID: 1, Contact_ID: 42, Notes: 'Test' };
      mockGetTableRecords.mockResolvedValueOnce([mockLog]);

      const service = await ContactLogService.getInstance();
      const result = await service.getContactLogById(1);

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'Contact_Log',
          filter: 'Contact_Log_ID = 1',
          top: 1,
        })
      );
      expect(result).toEqual(mockLog);
    });

    it('should return null when not found', async () => {
      mockGetTableRecords.mockResolvedValueOnce([]);

      const service = await ContactLogService.getInstance();
      const result = await service.getContactLogById(999);

      expect(result).toBeNull();
    });
  });

  describe('getContactLogsByContactId', () => {
    it('should fetch logs with correct ordering', async () => {
      const mockLogs = [
        { Contact_Log_ID: 2, Contact_ID: 42 },
        { Contact_Log_ID: 1, Contact_ID: 42 },
      ];
      mockGetTableRecords.mockResolvedValueOnce(mockLogs);

      const service = await ContactLogService.getInstance();
      const result = await service.getContactLogsByContactId(42);

      expect(mockGetTableRecords).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'Contact_Log',
          filter: 'Contact_ID = 42',
          orderBy: 'Contact_Date DESC',
        })
      );
      expect(result).toEqual(mockLogs);
    });
  });

  describe('createContactLog', () => {
    it('should validate, convert date to Central Time SQL, and create', async () => {
      const mockCreated = { Contact_Log_ID: 1, Contact_ID: 42 };
      mockCreateTableRecords.mockResolvedValueOnce([mockCreated]);

      const service = await ContactLogService.getInstance();
      const result = await service.createContactLog({
        Contact_ID: 42,
        Contact_Date: '2024-01-15T16:30:00.000Z',
        Contact_Log_Type_ID: 1,
        Notes: 'Test note',
        Planned_Contact_ID: null,
        Contact_Successful: null,
        Original_Contact_Log_Entry: null,
        Feedback_Entry_ID: null,
      }, 100);

      // Verify the date was converted from UTC to Central Time SQL format
      const createdRecord = mockCreateTableRecords.mock.calls[0][1][0];
      expect(createdRecord.Contact_Date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      // 16:30 UTC = 10:30 CT (CST is UTC-6)
      expect(createdRecord.Contact_Date).toContain('10:30:00');
      expect(createdRecord.Contact_ID).toBe(42);
      expect(createdRecord.Made_By).toBe(100);
      expect(result).toEqual(mockCreated);
    });

    it('should throw on Zod validation failure', async () => {
      const service = await ContactLogService.getInstance();

      // Missing required fields
      await expect(
        service.createContactLog({
          Contact_ID: 42,
          Contact_Date: 'not-a-date',
          Contact_Log_Type_ID: 1,
          Notes: 'Test',
        } as never, 100)
      ).rejects.toThrow();
    });

    it('should throw when API returns empty result', async () => {
      mockCreateTableRecords.mockResolvedValueOnce([]);

      const service = await ContactLogService.getInstance();

      await expect(
        service.createContactLog({
          Contact_ID: 42,
          Contact_Date: '2024-01-15T16:30:00.000Z',
          Contact_Log_Type_ID: 1,
          Notes: 'Test',
          Planned_Contact_ID: null,
          Contact_Successful: null,
          Original_Contact_Log_Entry: null,
          Feedback_Entry_ID: null,
        }, 100)
      ).rejects.toThrow('Failed to create contact log record');
    });
  });

  describe('updateContactLog', () => {
    it('should accept partial updates without date', async () => {
      const mockUpdated = { Contact_Log_ID: 1, Notes: 'Updated note' };
      mockUpdateTableRecords.mockResolvedValueOnce([mockUpdated]);

      const service = await ContactLogService.getInstance();
      const result = await service.updateContactLog(1, { Notes: 'Updated note' }, 500);

      expect(mockUpdateTableRecords).toHaveBeenCalledWith(
        'Contact_Log',
        [
          expect.objectContaining({
            Contact_Log_ID: 1,
            Notes: 'Updated note',
          }),
        ],
        { $userId: 500 }
      );
      expect(result).toEqual(mockUpdated);
    });

    it('should convert date to Central Time SQL on update', async () => {
      mockUpdateTableRecords.mockResolvedValueOnce([{ Contact_Log_ID: 1 }]);

      const service = await ContactLogService.getInstance();
      await service.updateContactLog(1, {
        Contact_Date: '2024-06-15T20:00:00.000Z',
      }, 500);

      const updateRecord = mockUpdateTableRecords.mock.calls[0][1][0];
      // 20:00 UTC in June (CDT, UTC-5) = 15:00 CT
      expect(updateRecord.Contact_Date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(updateRecord.Contact_Date).toContain('15:00:00');
    });

    it('should throw when API returns empty result', async () => {
      mockUpdateTableRecords.mockResolvedValueOnce([]);

      const service = await ContactLogService.getInstance();
      await expect(
        service.updateContactLog(1, { Notes: 'Updated' }, 500)
      ).rejects.toThrow('Failed to update contact log record');
    });
  });

  /**
   * F4 — attribution is server-authoritative.
   *
   * These drive the service with the shapes a CRAFTED REQUEST can actually
   * send, not the shapes TypeScript permits. A server action is a POST
   * endpoint whose payload the caller controls and types are erased at
   * runtime, so every input here is cast with `as never` on purpose.
   */
  describe('attribution is server-authoritative (F4)', () => {
    const validCreate = {
      Contact_ID: 42,
      Contact_Date: '2024-01-15T16:30:00.000Z',
      Contact_Log_Type_ID: 1,
      Notes: 'Test note',
      Planned_Contact_ID: null,
      Contact_Successful: null,
      Original_Contact_Log_Entry: null,
      Feedback_Entry_ID: null,
    };

    it('ignores a caller-supplied Made_By on create and stamps the acting user', async () => {
      mockCreateTableRecords.mockResolvedValueOnce([{ Contact_Log_ID: 1 }]);
      const service = await ContactLogService.getInstance();

      await service.createContactLog({ ...validCreate, Made_By: 999 } as never, 4242);

      const record = mockCreateTableRecords.mock.calls[0][1][0];
      expect(record.Made_By).toBe(4242);
      expect(record.Made_By).not.toBe(999);
      expect(mockCreateTableRecords.mock.calls[0][2]).toEqual({ $userId: 4242 });
    });

    it('strips a smuggled Made_By on update and never sends it at all', async () => {
      mockUpdateTableRecords.mockResolvedValueOnce([{ Contact_Log_ID: 1 }]);
      const service = await ContactLogService.getInstance();

      await service.updateContactLog(1, { Notes: 'x', Made_By: 999 } as never, 500);

      const record = mockUpdateTableRecords.mock.calls[0][1][0];
      // Not merely overwritten — absent, so MP preserves the original author.
      expect(record).not.toHaveProperty('Made_By');
      expect(mockUpdateTableRecords.mock.calls[0][2]).toEqual({ $userId: 500 });
    });

    it('never sends Contact_ID on update, so a log cannot be re-parented', async () => {
      mockUpdateTableRecords.mockResolvedValueOnce([{ Contact_Log_ID: 1 }]);
      const service = await ContactLogService.getInstance();

      await service.updateContactLog(1, { Notes: 'x', Contact_ID: 999 } as never, 500);

      expect(mockUpdateTableRecords.mock.calls[0][1][0]).not.toHaveProperty('Contact_ID');
    });

    it('strips the linkage FKs on update', async () => {
      mockUpdateTableRecords.mockResolvedValueOnce([{ Contact_Log_ID: 1 }]);
      const service = await ContactLogService.getInstance();

      await service.updateContactLog(
        1,
        {
          Notes: 'x',
          Planned_Contact_ID: 7,
          Original_Contact_Log_Entry: 8,
          Feedback_Entry_ID: 9,
        } as never,
        500
      );

      const record = mockUpdateTableRecords.mock.calls[0][1][0];
      expect(record).not.toHaveProperty('Planned_Contact_ID');
      expect(record).not.toHaveProperty('Original_Contact_Log_Entry');
      expect(record).not.toHaveProperty('Feedback_Entry_ID');
    });

    // Two guards, two different rejections — both before any MP call.
    it.each([0, -5])(
      'refuses a non-positive Contact_ID (%s) via sanitizeId',
      async (contactId) => {
        // These pass Zod's `z.number().int()` and are caught by sanitizeId.
        const service = await ContactLogService.getInstance();

        await expect(
          service.createContactLog({ ...validCreate, Contact_ID: contactId } as never, 100)
        ).rejects.toThrow(/Invalid ID/);
        expect(mockCreateTableRecords).not.toHaveBeenCalled();
      }
    );

    it('refuses an injected string Contact_ID at the Zod boundary', async () => {
      // A type-erased Flight arg can arrive as a string. This one never
      // reaches sanitizeId — Zod's number check rejects it first — so the
      // assertion is on the outcome (no MP call), not on a specific message.
      const service = await ContactLogService.getInstance();

      await expect(
        service.createContactLog({ ...validCreate, Contact_ID: '1 OR 1=1' } as never, 100)
      ).rejects.toThrow();
      expect(mockCreateTableRecords).not.toHaveBeenCalled();
    });

    it.each([0, undefined, '7 OR 1=1'])(
      'fails closed when the acting user is unusable (%s)',
      async (madeBy) => {
        // Better no record than a record attributed to nobody.
        const service = await ContactLogService.getInstance();

        await expect(
          service.createContactLog(validCreate as never, madeBy as never)
        ).rejects.toThrow(/Invalid ID/);
        expect(mockCreateTableRecords).not.toHaveBeenCalled();
      }
    );

    // Negative controls — prove the omits do not over-strip.
    it('still passes a legitimate positive Contact_ID through unchanged', async () => {
      mockCreateTableRecords.mockResolvedValueOnce([{ Contact_Log_ID: 1 }]);
      const service = await ContactLogService.getInstance();

      await service.createContactLog(validCreate as never, 100);

      expect(mockCreateTableRecords.mock.calls[0][1][0].Contact_ID).toBe(42);
    });

    it('still sends an ordinary Notes-only edit', async () => {
      mockUpdateTableRecords.mockResolvedValueOnce([{ Contact_Log_ID: 1 }]);
      const service = await ContactLogService.getInstance();

      await service.updateContactLog(1, { Notes: 'just the notes' }, 500);

      const record = mockUpdateTableRecords.mock.calls[0][1][0];
      expect(record).toEqual({ Contact_Log_ID: 1, Notes: 'just the notes' });
    });
  });

  describe('deleteContactLog', () => {
    it('should delete by ID', async () => {
      mockDeleteTableRecords.mockResolvedValueOnce(undefined);

      const service = await ContactLogService.getInstance();
      await service.deleteContactLog(42, 500);

      expect(mockDeleteTableRecords).toHaveBeenCalledWith('Contact_Log', [42], { $userId: 500 });
    });

    it('should propagate delete errors', async () => {
      mockDeleteTableRecords.mockRejectedValueOnce(new Error('Record not found'));

      const service = await ContactLogService.getInstance();
      await expect(service.deleteContactLog(999, 500)).rejects.toThrow('Record not found');
    });
  });
});
