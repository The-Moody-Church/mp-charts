import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComplianceToolConfig } from '@/lib/compliance-tools-config-types';

const mockGetTableRecords = vi.fn();
const mockGetFilesByRecord = vi.fn();
const mockCreateTableRecords = vi.fn();
const mockUpdateTableRecords = vi.fn();
const mockUploadFiles = vi.fn();

vi.mock('@/lib/providers/ministry-platform', () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
    getFilesByRecord = mockGetFilesByRecord;
    createTableRecords = mockCreateTableRecords;
    updateTableRecords = mockUpdateTableRecords;
    uploadFiles = mockUploadFiles;
  },
}));

// Requirement IDs are distinct across types, so a mix-up between types cannot
// pass by accident.
function makeTool(overrides: Partial<ComplianceToolConfig> = {}): ComplianceToolConfig {
  return {
    slug: 'tool-a',
    toolName: 'Tool A',
    description: '',
    enabled: true,
    groupRoleIds: [],
    journeyId: null,
    journeyMilestones: [],
    requirements: [
      { requirementId: 0, label: 'BG', type: 'background_check', sortOrder: 1, visible: true },
      { requirementId: 10, label: 'Cert', type: 'certification', sortOrder: 2, visible: true },
      { requirementId: 12, label: 'Cert 2', type: 'certification', sortOrder: 3, visible: true },
      { requirementId: 13, label: 'Hidden cert', type: 'certification', sortOrder: 4, visible: false },
      { requirementId: 83, label: 'Form', type: 'form', sortOrder: 5, visible: true },
      { requirementId: 84, label: 'Hidden form', type: 'form', sortOrder: 6, visible: false },
      { requirementId: 7, label: 'MS', type: 'milestone', sortOrder: 7, visible: true },
      { requirementId: 8, label: 'Hidden MS', type: 'milestone', sortOrder: 8, visible: false },
    ],
    programId: 1,
    trackingGroupId: 500,
    defaultGroupRoleId: 16,
    supportsPause: false,
    pausedGroupId: null,
    pauseMilestoneId: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  } as ComplianceToolConfig;
}

let tool: ComplianceToolConfig = makeTool();
vi.mock('@/lib/compliance-tools-config', () => ({
  getComplianceToolBySlug: (slug: string) => (slug === 'tool-a' ? tool : null),
}));

import { ComplianceProcessingService } from '@/services/complianceProcessingService';

const IN_PARTICIPANT = 11;
const IN_CONTACT = 21;
const OUT_PARTICIPANT = 99;
const OUT_CONTACT = 98;

interface Call { table: string; select?: string; filter?: string; top?: number }

/** Dispatch MP reads by table. Scope (Group_Participants enumeration) is
 *  IN_PARTICIPANT only; Participants resolves IN_CONTACT <-> IN_PARTICIPANT. */
function mpData(rowsByTable: Record<string, unknown[]> = {}) {
  mockGetTableRecords.mockImplementation((p: Call) => {
    if (p.table in rowsByTable) return Promise.resolve(rowsByTable[p.table]);
    if (p.table === 'Group_Participants') return Promise.resolve([{ Participant_ID: IN_PARTICIPANT }]);
    if (p.table === 'Participants') {
      if (p.filter?.startsWith('Contact_ID')) {
        return Promise.resolve([{ Participant_ID: p.filter.endsWith(`= ${IN_CONTACT}`) ? IN_PARTICIPANT : OUT_PARTICIPANT }]);
      }
      if (p.filter?.startsWith('Participant_ID')) {
        return Promise.resolve([{ Contact_ID: p.filter.endsWith(`= ${IN_PARTICIPANT}`) ? IN_CONTACT : OUT_CONTACT }]);
      }
    }
    return Promise.resolve([]);
  });
}

const callsTo = (table: string) =>
  mockGetTableRecords.mock.calls.map(c => c[0] as Call).filter(c => c.table === table);

const svc = () => ComplianceProcessingService.getInstance('tool-a');

const ORIGINAL_MODE = process.env.F2_SCOPE_ENFORCEMENT;

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateTableRecords.mockResolvedValue([{ Participant_Milestone_ID: 1, Group_Participant_ID: 2 }]);
  mockUpdateTableRecords.mockResolvedValue([{}]);
  tool = makeTool();
  ComplianceProcessingService.clearCache();
  delete process.env.F2_SCOPE_ENFORCEMENT;
  process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL = 'https://mp.example/files';
  mockGetFilesByRecord.mockResolvedValue([
    { FileId: 1, FileName: 'r.pdf', FileExtension: '.pdf', UniqueFileId: 'u-1', IsImage: false },
  ]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.F2_SCOPE_ENFORCEMENT;
  else process.env.F2_SCOPE_ENFORCEMENT = ORIGINAL_MODE;
  vi.restoreAllMocks();
});

const FILES = [{ fileId: 1, fileName: 'r.pdf', fileUrl: 'https://mp.example/files/u-1', isPdf: true, isImage: false }];

describe('getRequirementFiles (N1)', () => {
  describe('background_check', () => {
    it('lists files for an in-scope contact, whatever the check type', async () => {
      for (const typeId of [3, null, 42]) {
        mockGetFilesByRecord.mockClear();
        mpData({ Background_Checks: [{ Contact_ID: IN_CONTACT, Background_Check_Type_ID: typeId }] });
        await expect(svc().getRequirementFiles('background_check', 555)).resolves.toEqual(FILES);
        expect(mockGetFilesByRecord).toHaveBeenCalledWith({ table: 'Background_Checks', recordId: 555 });
      }
    });

    it('denies an out-of-scope contact without listing files', async () => {
      mpData({ Background_Checks: [{ Contact_ID: OUT_CONTACT }] });
      await expect(svc().getRequirementFiles('background_check', 555)).rejects.toThrow(/Forbidden/);
      expect(mockGetFilesByRecord).not.toHaveBeenCalled();
    });

    it('denies with no MP call when the tool has no visible background-check requirement', async () => {
      tool = makeTool({
        requirements: [{ requirementId: 0, label: 'BG', type: 'background_check', sortOrder: 1, visible: false }],
      });
      mpData({ Background_Checks: [{ Contact_ID: IN_CONTACT }] });
      await expect(svc().getRequirementFiles('background_check', 555)).rejects.toThrow(/Forbidden/);
      expect(mockGetTableRecords).not.toHaveBeenCalled();
      expect(mockGetFilesByRecord).not.toHaveBeenCalled();
    });
  });

  describe('certification', () => {
    it('lists files for a configured type on an in-scope participant', async () => {
      for (const typeId of [10, 12]) {
        mpData({ Participant_Certifications: [{ Participant_ID: IN_PARTICIPANT, Certification_Type_ID: typeId }] });
        await expect(svc().getRequirementFiles('certification', 600)).resolves.toEqual(FILES);
      }
      expect(mockGetFilesByRecord).toHaveBeenLastCalledWith({ table: 'Participant_Certifications', recordId: 600 });
    });

    it('denies an unconfigured or hidden type after one lookup, before any scope read', async () => {
      for (const typeId of [11, 13]) {
        vi.clearAllMocks();
        ComplianceProcessingService.clearCache();
        mpData({ Participant_Certifications: [{ Participant_ID: IN_PARTICIPANT, Certification_Type_ID: typeId }] });
        await expect(svc().getRequirementFiles('certification', 600)).rejects.toThrow(/Forbidden/);
        expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
        expect(mockGetFilesByRecord).not.toHaveBeenCalled();
      }
    });

    it('denies a configured type on an out-of-scope participant', async () => {
      mpData({ Participant_Certifications: [{ Participant_ID: OUT_PARTICIPANT, Certification_Type_ID: 10 }] });
      await expect(svc().getRequirementFiles('certification', 600)).rejects.toThrow(/Forbidden/);
      expect(mockGetFilesByRecord).not.toHaveBeenCalled();
    });
  });

  describe('form', () => {
    it('lists files for a configured form on an in-scope contact', async () => {
      mpData({ Form_Responses: [{ Contact_ID: IN_CONTACT, Form_ID: 83 }] });
      await expect(svc().getRequirementFiles('form', 700)).resolves.toEqual(FILES);
      expect(mockGetFilesByRecord).toHaveBeenCalledWith({ table: 'Form_Responses', recordId: 700 });
    });

    it('denies an anonymous response (null Contact_ID) without a Participants lookup', async () => {
      mpData({ Form_Responses: [{ Contact_ID: null, Form_ID: 83 }] });
      await expect(svc().getRequirementFiles('form', 700)).rejects.toThrow(/Forbidden/);
      expect(callsTo('Participants')).toHaveLength(0);
      expect(mockGetFilesByRecord).not.toHaveBeenCalled();
    });

    it('denies an unconfigured or hidden form, and an out-of-scope contact', async () => {
      for (const row of [
        { Contact_ID: IN_CONTACT, Form_ID: 85 },
        { Contact_ID: IN_CONTACT, Form_ID: 84 },
        { Contact_ID: OUT_CONTACT, Form_ID: 83 },
      ]) {
        mpData({ Form_Responses: [row] });
        await expect(svc().getRequirementFiles('form', 700)).rejects.toThrow(/Forbidden/);
      }
      expect(mockGetFilesByRecord).not.toHaveBeenCalled();
    });
  });

  describe('milestone', () => {
    it('lists files for a visible requirement milestone of an in-scope participant', async () => {
      mpData({ Participant_Milestones: [{ Participant_ID: IN_PARTICIPANT, Milestone_ID: 7 }] });
      await expect(svc().getRequirementFiles('milestone', 800)).resolves.toEqual(FILES);
      expect(mockGetFilesByRecord).toHaveBeenCalledWith({ table: 'Participant_Milestones', recordId: 800 });
    });

    it('checks scope: the old path listed any milestone with no check at all', async () => {
      mpData({ Participant_Milestones: [{ Participant_ID: OUT_PARTICIPANT, Milestone_ID: 7 }] });
      await expect(svc().getRequirementFiles('milestone', 800)).rejects.toThrow(/Forbidden/);
      expect(mockGetFilesByRecord).not.toHaveBeenCalled();
    });

    it('denies a pause or journey milestone, which never appears as a milestone requirement', async () => {
      tool = makeTool({
        pauseMilestoneId: 30,
        journeyId: 5,
        journeyMilestones: [{ milestoneId: 31, label: 'J', sortOrder: 1, visible: true }],
      } as Partial<ComplianceToolConfig>);
      for (const milestoneId of [30, 31, 8]) {
        mpData({ Participant_Milestones: [{ Participant_ID: IN_PARTICIPANT, Milestone_ID: milestoneId }] });
        await expect(svc().getRequirementFiles('milestone', 800)).rejects.toThrow(/Forbidden/);
      }
      expect(mockGetFilesByRecord).not.toHaveBeenCalled();
    });
  });

  it('denies a record that does not exist, for every type', async () => {
    mpData();
    for (const type of ['background_check', 'certification', 'form', 'milestone']) {
      await expect(svc().getRequirementFiles(type, 900)).rejects.toThrow(/Forbidden/);
    }
    expect(mockGetFilesByRecord).not.toHaveBeenCalled();
  });

  it('looks the record up by primary key, top 1, selecting only owner and type', async () => {
    const expected: Record<string, { table: string; select: string; filter: string }> = {
      background_check: { table: 'Background_Checks', select: 'Contact_ID', filter: 'Background_Check_ID = 42' },
      certification: { table: 'Participant_Certifications', select: 'Participant_ID,Certification_Type_ID', filter: 'Participant_Certification_ID = 42' },
      form: { table: 'Form_Responses', select: 'Contact_ID,Form_ID', filter: 'Form_Response_ID = 42' },
      milestone: { table: 'Participant_Milestones', select: 'Participant_ID,Milestone_ID', filter: 'Participant_Milestone_ID = 42' },
    };
    for (const [type, want] of Object.entries(expected)) {
      vi.clearAllMocks();
      mpData();
      await expect(svc().getRequirementFiles(type, 42)).rejects.toThrow(/Forbidden/);
      expect(mockGetTableRecords.mock.calls[0][0]).toEqual({ ...want, top: 1 });
    }
  });

  it('rejects malformed IDs and unknown types with no MP call, in either mode', async () => {
    mpData();
    for (const mode of [undefined, 'report']) {
      if (mode) process.env.F2_SCOPE_ENFORCEMENT = mode;
      for (const id of ['1 OR 1=1', 0, -1, 1.5, '9007199254740993']) {
        await expect(svc().getRequirementFiles('form', id as unknown as number)).rejects.toThrow('Invalid ID');
      }
      for (const type of ['constructor', '__proto__', 'toString', 'journey_milestone', '', {} as unknown as string]) {
        await expect(svc().getRequirementFiles(type, 5)).rejects.toThrow('Unknown requirement type');
      }
    }
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  describe('report mode', () => {
    beforeEach(() => { process.env.F2_SCOPE_ENFORCEMENT = 'report'; });

    it('allows and warns once per failed gate, with numeric context only', async () => {
      mpData({ Participant_Certifications: [{ Participant_ID: OUT_PARTICIPANT, Certification_Type_ID: 11 }] });
      await expect(svc().getRequirementFiles('certification', 600)).resolves.toEqual(FILES);
      const warns = vi.mocked(console.warn).mock.calls.map(c => String(c[0]));
      expect(warns).toHaveLength(2);
      expect(warns[0]).toMatch(/^\[scope:report\] .*certification 600 type 11 is not a visible requirement/);
      expect(warns[1]).toMatch(/^\[scope:report\] .*participant 99 outside/);
      for (const w of warns) expect(w).toMatch(/^[\x20-\x7e—]+$/);
    });

    it('allows a null-owner form after one warn, with no sanitizeId throw', async () => {
      mpData({ Form_Responses: [{ Contact_ID: null, Form_ID: 83 }] });
      await expect(svc().getRequirementFiles('form', 700)).resolves.toEqual(FILES);
      expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
      expect(String(vi.mocked(console.warn).mock.calls[0][0])).toMatch(/has no owner/);
    });

    it('allows a missing record after one warn, as assertMilestoneRecordInScope does', async () => {
      mpData();
      await expect(svc().getRequirementFiles('form', 700)).resolves.toEqual(FILES);
      expect(vi.mocked(console.warn)).toHaveBeenCalledTimes(1);
    });
  });

  it('logs which gate denied a request in enforce mode', async () => {
    mpData({ Form_Responses: [{ Contact_ID: IN_CONTACT, Form_ID: 85 }] });
    await expect(svc().getRequirementFiles('form', 700)).rejects.toThrow('Forbidden: record is not in scope for this tool');
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith('[scope:deny] form 700 type 85 is not a visible requirement');
  });

  it('works in group-role mode', async () => {
    tool = makeTool({ trackingGroupId: null, groupRoleIds: [16] } as Partial<ComplianceToolConfig>);
    mpData({ Participant_Certifications: [{ Participant_ID: IN_PARTICIPANT, Certification_Type_ID: 10 }] });
    await expect(svc().getRequirementFiles('certification', 600)).resolves.toEqual(FILES);
    expect(callsTo('Group_Participants')[0].filter).toMatch(/^Group_Role_ID IN \(16\)/);
  });
});

describe('getMilestoneFiles', () => {
  beforeEach(() => {
    tool = makeTool({
      pauseMilestoneId: 30,
      journeyId: 5,
      journeyMilestones: [
        { milestoneId: 31, label: 'J', sortOrder: 1, visible: true },
        { milestoneId: 32, label: 'Hidden J', sortOrder: 2, visible: false },
      ],
    } as Partial<ComplianceToolConfig>);
  });

  it('allows every milestone the modal can show: requirement, pause and visible journey milestones', async () => {
    for (const milestoneId of [7, 30, 31]) {
      mpData({ Participant_Milestones: [{ Participant_ID: IN_PARTICIPANT, Milestone_ID: milestoneId }] });
      await expect(svc().getMilestoneFiles(800)).resolves.toEqual(FILES);
    }
    expect(mockGetFilesByRecord).toHaveBeenCalledWith({ table: 'Participant_Milestones', recordId: 800 });
  });

  it('denies a milestone the tool does not show, even for an in-scope participant', async () => {
    for (const milestoneId of [8, 32, 99]) {
      mpData({ Participant_Milestones: [{ Participant_ID: IN_PARTICIPANT, Milestone_ID: milestoneId }] });
      await expect(svc().getMilestoneFiles(800)).rejects.toThrow(/Forbidden/);
    }
    expect(mockGetFilesByRecord).not.toHaveBeenCalled();
  });

  it('ignores journey milestones when the tool has no journey (they are never fetched)', async () => {
    tool = makeTool({
      journeyMilestones: [{ milestoneId: 31, label: 'J', sortOrder: 1, visible: true }],
    } as Partial<ComplianceToolConfig>);
    mpData({ Participant_Milestones: [{ Participant_ID: IN_PARTICIPANT, Milestone_ID: 31 }] });
    await expect(svc().getMilestoneFiles(800)).rejects.toThrow(/Forbidden/);
  });

  it('denies an out-of-scope participant and a missing record', async () => {
    mpData({ Participant_Milestones: [{ Participant_ID: OUT_PARTICIPANT, Milestone_ID: 7 }] });
    await expect(svc().getMilestoneFiles(800)).rejects.toThrow(/Forbidden/);
    mpData();
    await expect(svc().getMilestoneFiles(800)).rejects.toThrow(/Forbidden/);
    expect(mockGetFilesByRecord).not.toHaveBeenCalled();
  });

  it('reads owner and Milestone_ID in one lookup', async () => {
    mpData({ Participant_Milestones: [{ Participant_ID: IN_PARTICIPANT, Milestone_ID: 7 }] });
    await svc().getMilestoneFiles(800);
    expect(callsTo('Participant_Milestones')).toEqual([
      { table: 'Participant_Milestones', select: 'Participant_ID,Milestone_ID', filter: 'Participant_Milestone_ID = 800', top: 1 },
    ]);
  });
});

describe('getParticipantDetail contact binding', () => {
  it('denies a contactId that is not the participant\'s own, before reading the contact', async () => {
    mpData();
    await expect(svc().getParticipantDetail(OUT_CONTACT, IN_PARTICIPANT, 1)).rejects.toThrow(/Forbidden/);
    expect(callsTo('Contacts')).toHaveLength(0);
    expect(callsTo('Background_Checks')).toHaveLength(0);
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith(`[scope:deny] participant ${IN_PARTICIPANT} does not belong to contact ${OUT_CONTACT}`);
  });

  it('accepts the participant\'s own contact', async () => {
    mpData(); // no Contacts row: the method returns null after passing both checks
    await expect(svc().getParticipantDetail(IN_CONTACT, IN_PARTICIPANT, 1)).resolves.toBeNull();
    expect(callsTo('Contacts')).toHaveLength(1);
  });

  it('denies a group-participant row that belongs to someone else', async () => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Group_Participants' && p.filter?.startsWith('Group_Participant_ID')) {
        return Promise.resolve([{ End_Date: null, Participant_ID: OUT_PARTICIPANT }]);
      }
      if (p.table === 'Group_Participants') return Promise.resolve([{ Participant_ID: IN_PARTICIPANT }]);
      if (p.table === 'Participants') return Promise.resolve([{ Contact_ID: IN_CONTACT }]);
      if (p.table === 'Contacts') {
        return Promise.resolve([{ Contact_ID: IN_CONTACT, First_Name: 'A', Nickname: null, Last_Name: 'B', Image_GUID: null, Email_Address: null, Mobile_Phone: null }]);
      }
      return Promise.resolve([]);
    });
    await expect(svc().getParticipantDetail(IN_CONTACT, IN_PARTICIPANT, 77)).rejects.toThrow(/Forbidden/);
  });
});

describe('getParticipantDetail binding: report mode and string IDs', () => {
  it('report mode warns on a mismatched contact and still answers', async () => {
    process.env.F2_SCOPE_ENFORCEMENT = 'report';
    mpData();
    await expect(svc().getParticipantDetail(OUT_CONTACT, IN_PARTICIPANT, 1)).resolves.toBeNull();
    expect(String(vi.mocked(console.warn).mock.calls[0][0])).toMatch(/^\[scope:report\] .*does not belong to contact 98/);
  });

  it('accepts string-typed IDs (React Flight args are type-erased) for the own pair', async () => {
    mpData();
    await expect(
      svc().getParticipantDetail(String(IN_CONTACT) as unknown as number, String(IN_PARTICIPANT) as unknown as number, '1' as unknown as number),
    ).resolves.toBeNull();
    expect(callsTo('Contacts')).toHaveLength(1);
  });
});

describe('pause/resume group-participant binding', () => {
  const GP_ROW = 77;
  const pauseTool = () => makeTool({
    supportsPause: true, pausedGroupId: 600, pauseMilestoneId: 30, programId: 1,
  } as Partial<ComplianceToolConfig>);

  function gpRow(row: { Participant_ID: number; Group_ID: number } | null) {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Group_Participants' && p.filter?.startsWith('Group_Participant_ID')) {
        return Promise.resolve(row ? [row] : []);
      }
      if (p.table === 'Group_Participants') return Promise.resolve([{ Participant_ID: IN_PARTICIPANT }]);
      return Promise.resolve([]);
    });
  }

  beforeEach(() => { tool = pauseTool(); });

  it('pauses when the row is the participant\'s tracking-group row', async () => {
    gpRow({ Participant_ID: IN_PARTICIPANT, Group_ID: 500 });
    await svc().pauseParticipant({ participantId: IN_PARTICIPANT, currentGroupParticipantId: GP_ROW });
    expect(mockUpdateTableRecords).toHaveBeenCalledWith(
      'Group_Participants', [expect.objectContaining({ Group_Participant_ID: GP_ROW })], expect.anything(),
    );
  });

  it('refuses before any write when the row is someone else\'s, in another group, or missing', async () => {
    for (const row of [
      { Participant_ID: OUT_PARTICIPANT, Group_ID: 500 },
      { Participant_ID: IN_PARTICIPANT, Group_ID: 999 },
      null,
    ]) {
      gpRow(row);
      await expect(svc().pauseParticipant({ participantId: IN_PARTICIPANT, currentGroupParticipantId: GP_ROW })).rejects.toThrow(/Forbidden/);
    }
    expect(mockCreateTableRecords).not.toHaveBeenCalled();
    expect(mockUpdateTableRecords).not.toHaveBeenCalled();
  });

  it('resume requires the paused-group row', async () => {
    gpRow({ Participant_ID: IN_PARTICIPANT, Group_ID: 500 });
    await expect(svc().resumeParticipant({ participantId: IN_PARTICIPANT, currentGroupParticipantId: GP_ROW })).rejects.toThrow(/Forbidden/);
    expect(mockUpdateTableRecords).not.toHaveBeenCalled();
    gpRow({ Participant_ID: IN_PARTICIPANT, Group_ID: 600 });
    await svc().resumeParticipant({ participantId: IN_PARTICIPANT, currentGroupParticipantId: GP_ROW });
    expect(mockUpdateTableRecords).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed group-participant ID before any write', async () => {
    gpRow({ Participant_ID: IN_PARTICIPANT, Group_ID: 500 });
    await expect(
      svc().pauseParticipant({ participantId: IN_PARTICIPANT, currentGroupParticipantId: '77 OR 1=1' as unknown as number }),
    ).rejects.toThrow('Invalid ID');
    expect(mockCreateTableRecords).not.toHaveBeenCalled();
  });
});

describe('scope enumeration sharing', () => {
  it('runs one Group_Participants enumeration for concurrent file requests', async () => {
    mpData({ Participant_Certifications: [{ Participant_ID: IN_PARTICIPANT, Certification_Type_ID: 10 }] });
    await Promise.all([1, 2, 3, 4, 5].map(id => svc().getRequirementFiles('certification', id)));
    expect(callsTo('Group_Participants')).toHaveLength(1);
  });

  it('does not keep a failed enumeration', async () => {
    let fail = true;
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Participant_Certifications') return Promise.resolve([{ Participant_ID: IN_PARTICIPANT, Certification_Type_ID: 10 }]);
      if (p.table === 'Group_Participants') {
        if (fail) { fail = false; return Promise.reject(new Error('ConnectTimeoutError')); }
        return Promise.resolve([{ Participant_ID: IN_PARTICIPANT }]);
      }
      return Promise.resolve([]);
    });
    await expect(svc().getRequirementFiles('certification', 1)).rejects.toThrow('ConnectTimeoutError');
    await expect(svc().getRequirementFiles('certification', 1)).resolves.toEqual(FILES);
  });

  it('shares the enumeration across sequential calls inside the window', async () => {
    mpData({ Participant_Certifications: [{ Participant_ID: IN_PARTICIPANT, Certification_Type_ID: 10 }] });
    await svc().getRequirementFiles('certification', 1);
    await svc().getRequirementFiles('certification', 2);
    expect(callsTo('Group_Participants')).toHaveLength(1);
  });

  it('re-enumerates once the share window has passed', async () => {
    vi.useFakeTimers();
    try {
      mpData({ Participant_Certifications: [{ Participant_ID: IN_PARTICIPANT, Certification_Type_ID: 10 }] });
      await svc().getRequirementFiles('certification', 1);
      vi.advanceTimersByTime(15_001);
      await svc().getRequirementFiles('certification', 1);
      expect(callsTo('Group_Participants')).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getInstance', () => {
  it('throws a static message that does not echo the slug', () => {
    expect(() => ComplianceProcessingService.getInstance('evil\n[forged]')).toThrow(/^Compliance tool not found or disabled$/);
  });
});

describe('getRecordFiles stays private (N1)', () => {
  it('is not part of the public type', () => {
    const s = svc();
    // @ts-expect-error getRecordFiles must stay private: it lists files with no scope check
    expect(typeof s.getRecordFiles).toBe('function');
  });
});

describe('ComplianceProcessingService.uploadContactPhoto scope (N3)', () => {
  const photo = new File(['x'], 'p.png', { type: 'image/png' });

  it("uploads the photo of one of this tool's participants", async () => {
    mpData();
    await svc().uploadContactPhoto(IN_CONTACT, photo, 3);
    expect(mockUploadFiles).toHaveBeenCalledWith(expect.objectContaining({ table: 'Contacts', recordId: IN_CONTACT }));
  });

  it('refuses a contact outside the tool, before the upload', async () => {
    mpData();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(svc().uploadContactPhoto(OUT_CONTACT, photo, 3)).rejects.toThrow(/Forbidden/);
    expect(mockUploadFiles).not.toHaveBeenCalled();
  });

  it('refuses a non-integer contact ID before any read', async () => {
    mpData();
    await expect(svc().uploadContactPhoto('1 OR 1=1' as unknown as number, photo, 3)).rejects.toThrow(/Invalid ID/);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });
});
