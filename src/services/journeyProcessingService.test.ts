import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { JourneyToolConfig } from '@/lib/journey-tools-config';

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

let TOOL = {
  slug: 'journey-a',
  toolName: 'Journey A',
  enabled: true,
  trackingGroupId: 500,
  pausedGroupId: null,
  supportsPause: false,
  programId: 1,
  milestones: [],
  pauseMilestoneId: null,
} as unknown as JourneyToolConfig;
const BASE_TOOL = TOOL;

vi.mock('@/lib/journey-tools-config', () => ({
  getJourneyToolBySlug: (slug: string) => (slug === 'journey-a' ? TOOL : null),
}));

import { JourneyProcessingService } from '@/services/journeyProcessingService';

const IN_PARTICIPANT = 11;
const IN_CONTACT = 21;
const OTHER_CONTACT = 98;

interface Call { table: string; filter?: string }

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateTableRecords.mockResolvedValue([{ Participant_Milestone_ID: 1, Group_Participant_ID: 2 }]);
  mockUpdateTableRecords.mockResolvedValue([{}]);
  TOOL = BASE_TOOL;
  mockGetFilesByRecord.mockResolvedValue([]);
  JourneyProcessingService.clearCache();
  delete process.env.F2_SCOPE_ENFORCEMENT;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockGetTableRecords.mockImplementation((p: Call) => {
    if (p.table === 'Group_Participants') return Promise.resolve([{ Participant_ID: IN_PARTICIPANT }]);
    if (p.table === 'Participants') return Promise.resolve([{ Contact_ID: IN_CONTACT }]);
    return Promise.resolve([]);
  });
});

afterEach(() => vi.restoreAllMocks());

const contactReads = () => mockGetTableRecords.mock.calls.filter(c => (c[0] as Call).table === 'Contacts');

describe('JourneyProcessingService.getParticipantDetail contact binding', () => {
  it("denies a contactId that is not the participant's own, before reading the contact", async () => {
    const svc = JourneyProcessingService.getInstance('journey-a');
    await expect(svc.getParticipantDetail(OTHER_CONTACT, IN_PARTICIPANT, null)).rejects.toThrow(/Forbidden/);
    expect(contactReads()).toHaveLength(0);
  });

  it("accepts the participant's own contact", async () => {
    const svc = JourneyProcessingService.getInstance('journey-a');
    await expect(svc.getParticipantDetail(IN_CONTACT, IN_PARTICIPANT, null)).resolves.toBeNull();
    expect(contactReads()).toHaveLength(1);
  });
});

describe('JourneyProcessingService.getInstance', () => {
  it('throws a static message that does not echo the slug', () => {
    expect(() => JourneyProcessingService.getInstance('evil\n[forged]')).toThrow(/^Journey tool not found or disabled$/);
  });
});

describe('JourneyProcessingService.getMilestoneFiles', () => {
  beforeEach(() => {
    TOOL = {
      ...BASE_TOOL,
      milestones: [
        { milestoneId: 7, label: 'A', sortOrder: 1, visible: true },
        { milestoneId: 8, label: 'Hidden', sortOrder: 2, visible: false },
      ],
      pauseMilestoneId: 30,
    } as unknown as JourneyToolConfig;
  });

  function milestoneRow(row: { Participant_ID: number; Milestone_ID: number } | null) {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Participant_Milestones') return Promise.resolve(row ? [row] : []);
      if (p.table === 'Group_Participants') return Promise.resolve([{ Participant_ID: IN_PARTICIPANT }]);
      return Promise.resolve([]);
    });
  }

  it('lists files for a visible or pause milestone of an in-scope participant', async () => {
    for (const milestoneId of [7, 30]) {
      milestoneRow({ Participant_ID: IN_PARTICIPANT, Milestone_ID: milestoneId });
      await expect(JourneyProcessingService.getInstance('journey-a').getMilestoneFiles(800)).resolves.toEqual([]);
    }
    expect(mockGetFilesByRecord).toHaveBeenCalledTimes(2);
  });

  it('denies a milestone the tool does not show, an out-of-scope owner, and a missing record', async () => {
    for (const row of [
      { Participant_ID: IN_PARTICIPANT, Milestone_ID: 8 },
      { Participant_ID: IN_PARTICIPANT, Milestone_ID: 99 },
      { Participant_ID: 55, Milestone_ID: 7 },
      null,
    ]) {
      milestoneRow(row);
      await expect(JourneyProcessingService.getInstance('journey-a').getMilestoneFiles(800)).rejects.toThrow(/Forbidden/);
    }
    expect(mockGetFilesByRecord).not.toHaveBeenCalled();
  });
});

describe('JourneyProcessingService pause/resume group-participant binding', () => {
  beforeEach(() => {
    TOOL = {
      ...BASE_TOOL,
      supportsPause: true,
      pausedGroupId: 600,
      pauseMilestoneId: 30,
      defaultGroupRoleId: 16,
    } as unknown as JourneyToolConfig;
  });

  function gpRow(row: { Participant_ID: number; Group_ID: number } | null) {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Group_Participants' && p.filter?.startsWith('Group_Participant_ID')) {
        return Promise.resolve(row ? [row] : []);
      }
      if (p.table === 'Group_Participants') return Promise.resolve([{ Participant_ID: IN_PARTICIPANT }]);
      return Promise.resolve([]);
    });
  }

  it('pauses with the participant\'s own tracking-group row', async () => {
    gpRow({ Participant_ID: IN_PARTICIPANT, Group_ID: 500 });
    await JourneyProcessingService.getInstance('journey-a').pauseParticipant({ participantId: IN_PARTICIPANT, currentGroupParticipantId: 77 });
    expect(mockUpdateTableRecords).toHaveBeenCalledTimes(1);
  });

  it('refuses before any write for another participant\'s row or the wrong group', async () => {
    for (const row of [{ Participant_ID: 55, Group_ID: 500 }, { Participant_ID: IN_PARTICIPANT, Group_ID: 999 }, null]) {
      gpRow(row);
      await expect(
        JourneyProcessingService.getInstance('journey-a').pauseParticipant({ participantId: IN_PARTICIPANT, currentGroupParticipantId: 77 }),
      ).rejects.toThrow(/Forbidden/);
      await expect(
        JourneyProcessingService.getInstance('journey-a').resumeParticipant({ participantId: IN_PARTICIPANT, currentGroupParticipantId: 77 }),
      ).rejects.toThrow(/Forbidden/);
    }
    expect(mockCreateTableRecords).not.toHaveBeenCalled();
    expect(mockUpdateTableRecords).not.toHaveBeenCalled();
  });
});


describe('JourneyProcessingService.uploadContactPhoto scope (N3)', () => {
  const photo = new File(['x'], 'p.png', { type: 'image/png' });
  beforeEach(() => {
    mockGetTableRecords.mockImplementation((p: Call) => {
      if (p.table === 'Group_Participants') return Promise.resolve([{ Participant_ID: IN_PARTICIPANT }]);
      if (p.table === 'Participants') {
        return Promise.resolve([{ Participant_ID: p.filter === `Contact_ID = ${IN_CONTACT}` ? IN_PARTICIPANT : 55 }]);
      }
      return Promise.resolve([]);
    });
  });

  it("uploads the photo of one of this tool's participants", async () => {
    await JourneyProcessingService.getInstance('journey-a').uploadContactPhoto(IN_CONTACT, photo, 3);
    expect(mockUploadFiles).toHaveBeenCalledWith(expect.objectContaining({ table: 'Contacts', recordId: IN_CONTACT }));
  });

  it('refuses a contact outside the tool, before the upload', async () => {
    await expect(
      JourneyProcessingService.getInstance('journey-a').uploadContactPhoto(OTHER_CONTACT, photo, 3),
    ).rejects.toThrow(/Forbidden/);
    expect(mockUploadFiles).not.toHaveBeenCalled();
  });

  it('refuses a non-integer contact ID before any read', async () => {
    await expect(
      JourneyProcessingService.getInstance('journey-a').uploadContactPhoto('1 OR 1=1' as unknown as number, photo, 3),
    ).rejects.toThrow(/Invalid ID/);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });
});
