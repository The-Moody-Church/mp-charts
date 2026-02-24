import { MPHelper } from '@/lib/providers/ministry-platform';
import { sanitizeIds } from '@/lib/providers/ministry-platform/utils/filter-sanitize';
import {
  BaptismApplicantInfo,
  BaptismCard,
  BaptismDetail,
  BaptismChecklistItem,
  BaptismMilestoneDetail,
  BaptismMilestoneFileInfo,
  BaptismWriteBackConfig,
} from '@/lib/dto';

// Environment variable helpers
function getEnvId(key: string): number | null {
  const val = process.env[key];
  if (!val) return null;
  const num = Number(val.trim());
  return isNaN(num) ? null : num;
}

/**
 * Returns the current date/time formatted as an ISO-like string in Central time.
 * Ministry Platform expects Central time for date fields — using UTC shifts dates forward.
 */
function nowCentral(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

// Batch size for IN clause queries to avoid URL length limits
const BATCH_SIZE = 100;

// Ordered milestone configuration — drives the checklist builder
interface MilestoneConfig {
  key: string;
  label: string;
  envKey: string;
  order: number;
}

const MILESTONE_CONFIG: MilestoneConfig[] = [
  { key: 'application', label: 'Application', envKey: 'BAPTISM_APPLICATION_MILESTONE_ID', order: 1 },
  { key: 'confirmation_email', label: 'Confirmation Email Sent', envKey: 'BAPTISM_CONFIRMATION_EMAIL_MILESTONE_ID', order: 2 },
  { key: 'scheduled_interview', label: 'Interview Scheduled', envKey: 'BAPTISM_SCHEDULED_INTERVIEW_MILESTONE_ID', order: 3 },
  { key: 'completed_interview', label: 'Interview Completed', envKey: 'BAPTISM_COMPLETED_INTERVIEW_MILESTONE_ID', order: 4 },
  { key: 'approved', label: 'Approved for Baptism', envKey: 'BAPTISM_APPROVED_MILESTONE_ID', order: 5 },
  { key: 'info_request_email', label: 'Info Request Email Sent', envKey: 'BAPTISM_INFO_REQUEST_EMAIL_MILESTONE_ID', order: 6 },
  { key: 'items_received', label: 'Baptism Items Received', envKey: 'BAPTISM_ITEMS_RECEIVED_MILESTONE_ID', order: 7 },
  { key: 'scheduled', label: 'Baptism Scheduled', envKey: 'BAPTISM_SCHEDULED_MILESTONE_ID', order: 8 },
  { key: 'baptism', label: 'Baptism', envKey: 'BAPTISM_CAPSTONE_MILESTONE_ID', order: 9 },
];

// Raw record types from MP queries
interface GroupParticipantRecord {
  Group_Participant_ID: number;
  Participant_ID: number;
  Group_ID: number;
  Group_Role_ID: number;
  Start_Date: string;
  End_Date: string | null;
}

interface BaptismContactRecord {
  Contact_ID: number;
  Participant_ID: number;
  First_Name: string;
  Nickname: string | null;
  Last_Name: string;
  Image_GUID: string | null;
  Email_Address: string | null;
  Mobile_Phone: string | null;
}

interface ParticipantRecord {
  Participant_ID: number;
  Contact_ID: number;
}

interface MilestoneRecord {
  Participant_Milestone_ID: number;
  Participant_ID: number;
  Milestone_ID: number;
  Date_Accomplished: string | null;
  Notes: string | null;
}

export class BaptismService {
  private static instance: BaptismService;
  private mp: MPHelper | null = null;

  private constructor() {}

  public static async getInstance(accessToken?: string): Promise<BaptismService> {
    if (accessToken) {
      const instance = new BaptismService();
      instance.mp = new MPHelper({ accessToken });
      return instance;
    }
    if (!BaptismService.instance) {
      BaptismService.instance = new BaptismService();
      BaptismService.instance.mp = new MPHelper();
    }
    return BaptismService.instance;
  }

  // ---------------------------------------------------------------
  // Tab 1: Current Baptism Applicants
  // ---------------------------------------------------------------

  public async getCurrentApplicants(): Promise<BaptismCard[]> {
    const groupId = getEnvId('BAPTISM_CURRENT_GROUP_ID');
    if (!groupId) {
      console.warn('BAPTISM_CURRENT_GROUP_ID not configured');
      return [];
    }
    return this.getApplicantsForGroup(groupId, false);
  }

  // ---------------------------------------------------------------
  // Tab 2: Paused Baptism Applicants
  // ---------------------------------------------------------------

  public async getPausedApplicants(): Promise<BaptismCard[]> {
    const groupId = getEnvId('BAPTISM_PAUSED_GROUP_ID');
    if (!groupId) {
      console.warn('BAPTISM_PAUSED_GROUP_ID not configured');
      return [];
    }
    return this.getApplicantsForGroup(groupId, true);
  }

  // ---------------------------------------------------------------
  // Detail Modal
  // ---------------------------------------------------------------

  public async getApplicantDetail(
    contactId: number,
    participantId: number,
    groupParticipantId: number
  ): Promise<BaptismDetail | null> {
    const contacts = await this.mp!.getTableRecords<{
      Contact_ID: number;
      First_Name: string;
      Nickname: string | null;
      Last_Name: string;
      Image_GUID: string | null;
      Email_Address: string | null;
      Mobile_Phone: string | null;
    }>({
      table: 'Contacts',
      select: 'Contact_ID,First_Name,Nickname,Last_Name,dp_fileUniqueId AS Image_GUID,Email_Address,Mobile_Phone',
      filter: `Contact_ID = ${contactId}`,
      top: 1
    });

    if (contacts.length === 0) return null;
    const contact = contacts[0];

    const info: BaptismApplicantInfo = {
      Contact_ID: contactId,
      Participant_ID: participantId,
      First_Name: contact.First_Name,
      Nickname: contact.Nickname,
      Last_Name: contact.Last_Name,
      Image_GUID: contact.Image_GUID,
      Group_Participant_ID: groupParticipantId,
      Start_Date: '',
      Email_Address: contact.Email_Address,
      Mobile_Phone: contact.Mobile_Phone,
    };

    const milestones = await this.fetchMilestones([participantId]);
    const checklist = this.buildChecklistForApplicant(participantId, milestones);

    const pauseMilestoneId = getEnvId('BAPTISM_PAUSED_MILESTONE_ID');
    const hasPauseMilestone = milestones.some(
      m => m.Milestone_ID === pauseMilestoneId && m.Participant_ID === participantId && m.Date_Accomplished
    );

    const milestoneDetails: BaptismMilestoneDetail[] = milestones
      .filter(m => m.Participant_ID === participantId)
      .map(m => ({
        Participant_Milestone_ID: m.Participant_Milestone_ID,
        Milestone_ID: m.Milestone_ID,
        Date_Accomplished: m.Date_Accomplished,
        Notes: m.Notes,
      }));

    const writeBackConfig = this.getWriteBackConfig();

    // Check if this group participant record has a future End_Date (no active record)
    const gpRecords = await this.mp!.getTableRecords<{ End_Date: string | null }>({
      table: 'Group_Participants',
      select: 'End_Date',
      filter: `Group_Participant_ID = ${groupParticipantId}`,
      top: 1
    });
    const endDate = gpRecords[0]?.End_Date ?? null;

    return {
      info,
      checklist,
      completedCount: checklist.filter(c => c.status === 'complete').length,
      totalCount: checklist.length,
      isPaused: hasPauseMilestone,
      isFullyComplete: checklist.every(c => c.status === 'complete'),
      endDate,
      milestones: milestoneDetails,
      writeBackConfig,
    };
  }

  // ---------------------------------------------------------------
  // Write-back: Create Milestone
  // ---------------------------------------------------------------

  public async createMilestone(data: {
    Participant_ID: number;
    Milestone_ID: number;
    Program_ID: number;
    Date_Accomplished?: string;
    Notes?: string;
  }, userId?: number): Promise<number> {
    const record = {
      ...data,
      Date_Accomplished: data.Date_Accomplished || nowCentral(),
    };

    const created = await this.mp!.createTableRecords(
      'Participant_Milestones', [record], {
        $userId: userId
      }
    ) as unknown as { Participant_Milestone_ID: number }[];

    return created[0].Participant_Milestone_ID;
  }

  // ---------------------------------------------------------------
  // Write-back: Update Milestone
  // ---------------------------------------------------------------

  public async updateMilestone(data: {
    Participant_Milestone_ID: number;
    Date_Accomplished?: string;
    Notes?: string;
  }, userId?: number): Promise<void> {
    const record: Record<string, unknown> = {
      Participant_Milestone_ID: data.Participant_Milestone_ID,
    };
    if (data.Date_Accomplished !== undefined) record.Date_Accomplished = data.Date_Accomplished;
    if (data.Notes !== undefined) record.Notes = data.Notes;

    await this.mp!.updateTableRecords('Participant_Milestones', [record], {
      $userId: userId,
    });
  }

  // ---------------------------------------------------------------
  // Pause / Resume Applicant
  // ---------------------------------------------------------------

  public async pauseApplicant(params: {
    participantId: number;
    currentGroupParticipantId: number;
    notes?: string;
    userId?: number;
  }): Promise<void> {
    const { participantId, currentGroupParticipantId, notes, userId } = params;
    const pausedGroupId = getEnvId('BAPTISM_PAUSED_GROUP_ID');
    const pauseMilestoneId = getEnvId('BAPTISM_PAUSED_MILESTONE_ID');
    const programId = getEnvId('BAPTISM_PROGRAM_ID');
    const defaultRoleId = getEnvId('BAPTISM_DEFAULT_GROUP_ROLE_ID');

    if (!pausedGroupId || !pauseMilestoneId || !programId || !defaultRoleId) {
      throw new Error('Baptism pause configuration not complete');
    }

    // Create pause milestone
    await this.createMilestone({
      Participant_ID: participantId,
      Milestone_ID: pauseMilestoneId,
      Program_ID: programId,
      Notes: notes,
    }, userId);

    // Move to paused group
    const now = nowCentral();
    await this.mp!.updateTableRecords(
      'Group_Participants',
      [{ Group_Participant_ID: currentGroupParticipantId, End_Date: now }],
      { $userId: userId }
    );

    await this.mp!.createTableRecords(
      'Group_Participants',
      [{
        Group_ID: pausedGroupId,
        Participant_ID: participantId,
        Group_Role_ID: defaultRoleId,
        Start_Date: now,
      }],
      { $userId: userId }
    );
  }

  public async resumeApplicant(params: {
    participantId: number;
    currentGroupParticipantId: number;
    userId?: number;
  }): Promise<void> {
    const { participantId, currentGroupParticipantId, userId } = params;
    const currentGroupId = getEnvId('BAPTISM_CURRENT_GROUP_ID');
    const defaultRoleId = getEnvId('BAPTISM_DEFAULT_GROUP_ROLE_ID');

    if (!currentGroupId || !defaultRoleId) {
      throw new Error('Baptism resume configuration not complete');
    }

    const now = nowCentral();
    await this.mp!.updateTableRecords(
      'Group_Participants',
      [{ Group_Participant_ID: currentGroupParticipantId, End_Date: now }],
      { $userId: userId }
    );

    await this.mp!.createTableRecords(
      'Group_Participants',
      [{
        Group_ID: currentGroupId,
        Participant_ID: participantId,
        Group_Role_ID: defaultRoleId,
        Start_Date: now,
      }],
      { $userId: userId }
    );
  }

  // ---------------------------------------------------------------
  // File Operations
  // ---------------------------------------------------------------

  public async getMilestoneFiles(milestoneRecordId: number): Promise<BaptismMilestoneFileInfo[]> {
    const fileBaseUrl = process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL;
    const files = await this.mp!.getFilesByRecord({
      table: 'Participant_Milestones',
      recordId: milestoneRecordId
    });

    return files.map(f => {
      const ext = (f.FileExtension || '').toLowerCase().replace('.', '');
      return {
        fileId: f.FileId,
        fileName: f.FileName,
        fileUrl: `${fileBaseUrl}/${f.UniqueFileId}`,
        isPdf: ext === 'pdf',
        isImage: f.IsImage
      };
    });
  }

  public async uploadDocument(
    table: string,
    recordId: number,
    files: File[],
    userId?: number
  ): Promise<void> {
    await this.mp!.uploadFiles({
      table,
      recordId,
      files,
      uploadParams: {
        description: 'Uploaded via Baptism Processing',
        userId
      }
    });
  }

  public async uploadContactPhoto(
    contactId: number,
    file: File,
    userId?: number
  ): Promise<void> {
    await this.mp!.uploadFiles({
      table: 'Contacts',
      recordId: contactId,
      files: [file],
      uploadParams: {
        description: 'Contact photo uploaded via Baptism Processing',
        isDefaultImage: true,
        userId
      }
    });
  }

  // ---------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------

  private async getApplicantsForGroup(groupId: number, isPaused: boolean): Promise<BaptismCard[]> {
    const now = nowCentral();

    const groupParticipants = await this.mp!.getTableRecords<GroupParticipantRecord>({
      table: 'Group_Participants',
      select: 'Group_Participant_ID,Participant_ID,Group_ID,Group_Role_ID,Start_Date,End_Date',
      filter: `Group_ID = ${groupId} AND (End_Date IS NULL OR End_Date >= '${now}')`
    });

    if (groupParticipants.length === 0) return [];

    // Deduplicate by Participant_ID: prefer the record with no End_Date (active).
    // If a participant only has records with future End_Dates, keep the latest one.
    const bestByParticipant = new Map<number, GroupParticipantRecord>();
    for (const gp of groupParticipants) {
      const existing = bestByParticipant.get(gp.Participant_ID);
      if (!existing) {
        bestByParticipant.set(gp.Participant_ID, gp);
      } else if (gp.End_Date === null && existing.End_Date !== null) {
        bestByParticipant.set(gp.Participant_ID, gp);
      } else if (gp.End_Date !== null && existing.End_Date !== null && gp.End_Date > existing.End_Date) {
        bestByParticipant.set(gp.Participant_ID, gp);
      }
    }

    // Track which participants have NO active (null End_Date) record
    const participantsWithNullEndDate = new Set(
      groupParticipants.filter(gp => gp.End_Date === null).map(gp => gp.Participant_ID)
    );

    const deduped = [...bestByParticipant.values()];

    // Build map of Participant_ID → End_Date for participants that need an alert
    // (only those with no active/null-End_Date record)
    const endDateAlerts = new Map<number, string>();
    for (const gp of deduped) {
      if (!participantsWithNullEndDate.has(gp.Participant_ID) && gp.End_Date) {
        endDateAlerts.set(gp.Participant_ID, gp.End_Date);
      }
    }

    const participantIds = deduped.map(gp => gp.Participant_ID);
    const contacts = await this.getContactsForParticipants(participantIds);

    const applicants = this.buildApplicantInfoList(deduped, contacts);
    if (applicants.length === 0) return [];

    return this.assembleApplicantCards(applicants, isPaused, endDateAlerts);
  }

  private async getContactsForParticipants(
    participantIds: number[]
  ): Promise<Map<number, BaptismContactRecord>> {
    if (participantIds.length === 0) return new Map();

    const allParticipants: ParticipantRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp!.getTableRecords<ParticipantRecord>({
        table: 'Participants',
        select: 'Participant_ID,Contact_ID',
        filter: `Participant_ID IN (${sanitizeIds(batchIds)})`
      });
      allParticipants.push(...batch);
    }

    const contactIds = [...new Set(allParticipants.map(p => p.Contact_ID))];
    if (contactIds.length === 0) return new Map();

    const allContacts: { Contact_ID: number; First_Name: string; Nickname: string | null; Last_Name: string; Image_GUID: string | null; Email_Address: string | null; Mobile_Phone: string | null }[] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batchIds = contactIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp!.getTableRecords<{
        Contact_ID: number;
        First_Name: string;
        Nickname: string | null;
        Last_Name: string;
        Image_GUID: string | null;
        Email_Address: string | null;
        Mobile_Phone: string | null;
      }>({
        table: 'Contacts',
        select: 'Contact_ID,First_Name,Nickname,Last_Name,dp_fileUniqueId AS Image_GUID,Email_Address,Mobile_Phone',
        filter: `Contact_ID IN (${sanitizeIds(batchIds)})`
      });
      allContacts.push(...batch);
    }

    const contactMap = new Map(allContacts.map(c => [c.Contact_ID, c]));
    const result = new Map<number, BaptismContactRecord>();

    for (const p of allParticipants) {
      const contact = contactMap.get(p.Contact_ID);
      if (contact) {
        result.set(p.Participant_ID, {
          Contact_ID: contact.Contact_ID,
          Participant_ID: p.Participant_ID,
          First_Name: contact.First_Name,
          Nickname: contact.Nickname,
          Last_Name: contact.Last_Name,
          Image_GUID: contact.Image_GUID,
          Email_Address: contact.Email_Address,
          Mobile_Phone: contact.Mobile_Phone,
        });
      }
    }

    return result;
  }

  private buildApplicantInfoList(
    groupParticipants: GroupParticipantRecord[],
    contacts: Map<number, BaptismContactRecord>
  ): BaptismApplicantInfo[] {
    const applicants: BaptismApplicantInfo[] = [];

    for (const gp of groupParticipants) {
      const contact = contacts.get(gp.Participant_ID);
      if (!contact) continue;

      applicants.push({
        Contact_ID: contact.Contact_ID,
        Participant_ID: gp.Participant_ID,
        First_Name: contact.First_Name,
        Nickname: contact.Nickname,
        Last_Name: contact.Last_Name,
        Image_GUID: contact.Image_GUID,
        Group_Participant_ID: gp.Group_Participant_ID,
        Start_Date: gp.Start_Date,
        Email_Address: contact.Email_Address,
        Mobile_Phone: contact.Mobile_Phone,
      });
    }

    applicants.sort((a, b) => a.Last_Name.localeCompare(b.Last_Name));
    return applicants;
  }

  private async assembleApplicantCards(
    applicants: BaptismApplicantInfo[],
    isPaused: boolean,
    endDateAlerts: Map<number, string>
  ): Promise<BaptismCard[]> {
    const participantIds = [...new Set(applicants.map(a => a.Participant_ID))];
    const milestones = await this.fetchMilestones(participantIds);

    return applicants.map(applicant => {
      const checklist = this.buildChecklistForApplicant(applicant.Participant_ID, milestones);

      return {
        info: applicant,
        checklist,
        completedCount: checklist.filter(c => c.status === 'complete').length,
        totalCount: checklist.length,
        isPaused,
        isFullyComplete: checklist.every(c => c.status === 'complete'),
        endDate: endDateAlerts.get(applicant.Participant_ID) ?? null,
      };
    });
  }

  private async fetchMilestones(participantIds: number[]): Promise<MilestoneRecord[]> {
    const milestoneIds = this.getAllMilestoneIds();
    if (milestoneIds.length === 0 || participantIds.length === 0) return [];

    const allResults: MilestoneRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp!.getTableRecords<MilestoneRecord>({
        table: 'Participant_Milestones',
        select: 'Participant_Milestone_ID,Participant_ID,Milestone_ID,Date_Accomplished,Notes',
        filter: `Milestone_ID IN (${sanitizeIds(milestoneIds)}) AND Participant_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: 'Date_Accomplished DESC'
      });
      allResults.push(...batch);
    }
    return allResults;
  }

  private getAllMilestoneIds(): number[] {
    const ids: number[] = [];
    for (const config of MILESTONE_CONFIG) {
      const id = getEnvId(config.envKey);
      if (id !== null) ids.push(id);
    }
    // Also include the pause milestone
    const pauseId = getEnvId('BAPTISM_PAUSED_MILESTONE_ID');
    if (pauseId !== null) ids.push(pauseId);
    return ids;
  }

  private buildChecklistForApplicant(
    participantId: number,
    milestones: MilestoneRecord[]
  ): BaptismChecklistItem[] {
    return MILESTONE_CONFIG.map(config => {
      const milestoneId = getEnvId(config.envKey);
      const milestone = milestones.find(
        m => m.Milestone_ID === milestoneId && m.Participant_ID === participantId
      );
      const completed = !!milestone?.Date_Accomplished;

      return {
        key: config.key,
        label: config.label,
        milestoneId: milestoneId || 0,
        completed,
        date: milestone?.Date_Accomplished || null,
        status: completed ? 'complete' as const : 'not_started' as const,
        notes: milestone?.Notes || null,
        order: config.order,
      };
    });
  }

  private getWriteBackConfig(): BaptismWriteBackConfig {
    const milestoneIds: Record<string, number | null> = {};
    for (const config of MILESTONE_CONFIG) {
      milestoneIds[config.key] = getEnvId(config.envKey);
    }

    return {
      programId: getEnvId('BAPTISM_PROGRAM_ID'),
      currentGroupId: getEnvId('BAPTISM_CURRENT_GROUP_ID'),
      pausedGroupId: getEnvId('BAPTISM_PAUSED_GROUP_ID'),
      defaultGroupRoleId: getEnvId('BAPTISM_DEFAULT_GROUP_ROLE_ID'),
      pauseMilestoneId: getEnvId('BAPTISM_PAUSED_MILESTONE_ID'),
      milestoneIds,
    };
  }
}
