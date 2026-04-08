import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTableService = {
  getTableRecords: vi.fn(),
  createTableRecords: vi.fn(),
  updateTableRecords: vi.fn(),
  deleteTableRecords: vi.fn(),
};

const mockProcedureService = {
  getProcedures: vi.fn(),
  executeProcedure: vi.fn(),
  executeProcedureWithBody: vi.fn(),
};

const mockDomainService = {
  getDomainInfo: vi.fn(),
  getGlobalFilters: vi.fn(),
};

const mockMetadataService = {
  refreshMetadata: vi.fn(),
  getTables: vi.fn(),
};

const mockFileService = {
  getFilesByRecord: vi.fn(),
  uploadFiles: vi.fn(),
  updateFile: vi.fn(),
  deleteFile: vi.fn(),
  getFileContentByUniqueId: vi.fn(),
  getFileMetadata: vi.fn(),
  getFileMetadataByUniqueId: vi.fn(),
};

vi.mock('./client', () => ({
  MinistryPlatformClient: vi.fn(),
}));

vi.mock('./services', () => ({
  TableService: class { getTableRecords = mockTableService.getTableRecords; createTableRecords = mockTableService.createTableRecords; updateTableRecords = mockTableService.updateTableRecords; deleteTableRecords = mockTableService.deleteTableRecords; },
  ProcedureService: class { getProcedures = mockProcedureService.getProcedures; executeProcedure = mockProcedureService.executeProcedure; executeProcedureWithBody = mockProcedureService.executeProcedureWithBody; },
  CommunicationService: class {},
  MetadataService: class { refreshMetadata = mockMetadataService.refreshMetadata; getTables = mockMetadataService.getTables; },
  DomainService: class { getDomainInfo = mockDomainService.getDomainInfo; getGlobalFilters = mockDomainService.getGlobalFilters; },
  FileService: class { getFilesByRecord = mockFileService.getFilesByRecord; uploadFiles = mockFileService.uploadFiles; updateFile = mockFileService.updateFile; deleteFile = mockFileService.deleteFile; getFileContentByUniqueId = mockFileService.getFileContentByUniqueId; getFileMetadata = mockFileService.getFileMetadata; getFileMetadataByUniqueId = mockFileService.getFileMetadataByUniqueId; },
}));

import { MinistryPlatformProvider } from './provider';

describe('MinistryPlatformProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (MinistryPlatformProvider as any).instance = undefined;
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const a = MinistryPlatformProvider.getInstance();
      const b = MinistryPlatformProvider.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('withAccessToken', () => {
    it('should return a new instance each time', () => {
      const a = MinistryPlatformProvider.withAccessToken('token-1');
      const b = MinistryPlatformProvider.withAccessToken('token-2');
      expect(a).not.toBe(b);
    });

    it('should return a different instance from singleton', () => {
      const singleton = MinistryPlatformProvider.getInstance();
      const perRequest = MinistryPlatformProvider.withAccessToken('token-1');
      expect(singleton).not.toBe(perRequest);
    });
  });

  describe('Table Service delegation', () => {
    it('should delegate getTableRecords', async () => {
      const mockData = [{ id: 1 }];
      mockTableService.getTableRecords.mockResolvedValueOnce(mockData);

      const provider = MinistryPlatformProvider.getInstance();
      const result = await provider.getTableRecords('Contacts', { $filter: 'Contact_ID = 1' });

      expect(mockTableService.getTableRecords).toHaveBeenCalledWith('Contacts', { $filter: 'Contact_ID = 1' });
      expect(result).toEqual(mockData);
    });

    it('should delegate createTableRecords', async () => {
      const records = [{ Name: 'Test' }];
      mockTableService.createTableRecords.mockResolvedValueOnce(records);

      const provider = MinistryPlatformProvider.getInstance();
      await provider.createTableRecords('Contacts', records, { $userId: 42 });

      expect(mockTableService.createTableRecords).toHaveBeenCalledWith('Contacts', records, { $userId: 42 });
    });

    it('should delegate updateTableRecords', async () => {
      const records = [{ Contact_ID: 1, Name: 'Updated' }];
      mockTableService.updateTableRecords.mockResolvedValueOnce(records);

      const provider = MinistryPlatformProvider.getInstance();
      await provider.updateTableRecords('Contacts', records);

      expect(mockTableService.updateTableRecords).toHaveBeenCalledWith('Contacts', records, undefined);
    });

    it('should delegate deleteTableRecords', async () => {
      mockTableService.deleteTableRecords.mockResolvedValueOnce([]);

      const provider = MinistryPlatformProvider.getInstance();
      await provider.deleteTableRecords('Contacts', [1, 2, 3]);

      expect(mockTableService.deleteTableRecords).toHaveBeenCalledWith('Contacts', [1, 2, 3], undefined);
    });
  });

  describe('Procedure Service delegation', () => {
    it('should delegate executeProcedureWithBody', async () => {
      mockProcedureService.executeProcedureWithBody.mockResolvedValueOnce([[{ result: 1 }]]);

      const provider = MinistryPlatformProvider.getInstance();
      const result = await provider.executeProcedureWithBody('api_MyProc', { '@Param': 42 });

      expect(mockProcedureService.executeProcedureWithBody).toHaveBeenCalledWith('api_MyProc', { '@Param': 42 });
      expect(result).toEqual([[{ result: 1 }]]);
    });
  });

  describe('Domain Service delegation', () => {
    it('should delegate getDomainInfo', async () => {
      const mockDomain = { Domain_ID: 1, Domain_Name: 'Test' };
      mockDomainService.getDomainInfo.mockResolvedValueOnce(mockDomain);

      const provider = MinistryPlatformProvider.getInstance();
      const result = await provider.getDomainInfo();

      expect(result).toEqual(mockDomain);
    });
  });

  describe('File Service delegation', () => {
    it('should delegate getFilesByRecord', async () => {
      const mockFiles = [{ File_ID: 1, File_Name: 'photo.jpg' }];
      mockFileService.getFilesByRecord.mockResolvedValueOnce(mockFiles);

      const provider = MinistryPlatformProvider.getInstance();
      const result = await provider.getFilesByRecord('Contacts', 42);

      expect(mockFileService.getFilesByRecord).toHaveBeenCalledWith('Contacts', 42, undefined);
      expect(result).toEqual(mockFiles);
    });
  });
});
