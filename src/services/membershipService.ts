import { MPHelper } from '@/lib/providers/ministry-platform';
import {
  MembershipApplicantInfo,
  MembershipCard,
  MembershipDetail,
  MembershipChecklistItem,
  MembershipMilestoneDetail,
  MembershipMilestoneFileInfo,
  MembershipWriteBackConfig,
} from '@/lib/dto';

// Environment variable helpers
function getEnvId(key: string): number | null {
  const val = process.env[key];
  if (!val) return null;
  const num = Number(val.trim());
  return isNaN(num) ? null : num;
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
  { key: 'pre_application', label: 'Membership Pre-Application', envKey: 'MEMBERSHIP_PRE_APPLICATION_MILESTONE_ID', order: 1 },
  { key: 'application', label: 'Membership Application', envKey: 'MEMBERSHIP_APPLICATION_MILESTONE_ID', order: 2 },
  { key: 'started_class', label: 'Started Membership Class', envKey: 'MEMBERSHIP_STARTED_CLASS_MILESTONE_ID', order: 3 },
  { key: 'completed_class', label: 'Completed Membership Class', envKey: 'MEMBERSHIP_COMPLETED_CLASS_MILESTONE_ID', order: 4 },
  { key: 'approved_by_lc', label: 'Membership Approved by LC', envKey: 'MEMBERSHIP_APPROVED_BY_LC_MILESTONE_ID', order: 5 },
  { key: 'listed_in_bulletin', label: 'Listed in Bulletin 2 Weeks', envKey: 'MEMBERSHIP_LISTED_IN_BULLETIN_MILESTONE_ID', order: 6 },
  { key: 'presented_to_congregation', label: 'Presented to Congregation', envKey: 'MEMBERSHIP_PRESENTED_TO_CONGREGATION_MILESTONE_ID', order: 7 },
  { key: 'registered_member', label: 'Registered Member', envKey: 'MEMBERSHIP_REGISTERED_MEMBER_MILESTONE_ID', order: 8 },
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

interface MembershipContactRecord {
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

export class MembershipService {
  private static instance: MembershipService;
  private mp: MPHelper | null = null;

  private constructor() {}

  public static async getInstance(accessToken?: string): Promise<MembershipService> {
    if (accessToken) {
      const instance = new MembershipService();
      instance.mp = new MPHelper({ accessToken });
      return instance;
    }
    if (!MembershipService.instance) {
      MembershipService.instance = new MembershipService();
      MembershipService.instance.mp = new MPHelper();
    }
    return MembershipService.instance;
  }

  // ---------------------------------------------------------------
  // Get All Applicants (single group, no tabs)
  // ---------------------------------------------------------------

  public async getApplicants(): Promise<MembershipCard[]> {
    const groupId = getEnvId('MEMBERSHIP_GROUP_ID');
    if (!groupId) {
      console.warn('MEMBERSHIP_GROUP_ID not configured');
      return [];
    }

    const now = new Date().toISOString();

    const groupParticipants = await this.mp!.getTableRecords<GroupParticipantRecord>({
      table: 'Group_Participants',
      select: 'Group_Participant_ID,Participant_ID,Group_ID,Group_Role_ID,Start_Date,End_Date',
      filter: `Group_ID = ${groupId} AND (End_Date IS NULL OR End_Date >= '${now}')`
    });

    if (groupParticipants.length === 0) return [];

    const participantIds = [...new Set(groupParticipants.map(gp => gp.Participant_ID))];
    const contacts = await this.getContactsForParticipants(participantIds);

    const applicants = this.buildApplicantInfoList(groupParticipants, contacts);
    if (applicants.length === 0) return [];

    return this.assembleApplicantCards(applicants);
  }

  // ---------------------------------------------------------------
  // Detail Modal
  // ---------------------------------------------------------------

  public async getApplicantDetail(
    contactId: number,
    participantId: number,
    groupParticipantId: number
  ): Promise<MembershipDetail | null> {
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

    const info: MembershipApplicantInfo = {
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

    const milestoneDetails: MembershipMilestoneDetail[] = milestones
      .filter(m => m.Participant_ID === participantId)
      .map(m => ({
        Participant_Milestone_ID: m.Participant_Milestone_ID,
        Milestone_ID: m.Milestone_ID,
        Date_Accomplished: m.Date_Accomplished,
        Notes: m.Notes,
      }));

    const writeBackConfig = this.getWriteBackConfig();

    return {
      info,
      checklist,
      completedCount: checklist.filter(c => c.status === 'complete').length,
      totalCount: checklist.length,
      isFullyComplete: checklist.every(c => c.status === 'complete'),
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
      Date_Accomplished: data.Date_Accomplished || new Date().toISOString(),
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
  // Complete Membership (creates milestone 48 + ends group participation)
  // ---------------------------------------------------------------

  public async completeMembership(params: {
    participantId: number;
    groupParticipantId: number;
    date?: string;
    notes?: string;
    userId?: number;
  }): Promise<number> {
    const { participantId, groupParticipantId, date, notes, userId } = params;
    const registeredMilestoneId = getEnvId('MEMBERSHIP_REGISTERED_MEMBER_MILESTONE_ID');
    const programId = getEnvId('MEMBERSHIP_PROGRAM_ID');

    if (!registeredMilestoneId || !programId) {
      throw new Error('Membership completion configuration not complete');
    }

    // Create the Registered Member milestone
    const milestoneRecordId = await this.createMilestone({
      Participant_ID: participantId,
      Milestone_ID: registeredMilestoneId,
      Program_ID: programId,
      Date_Accomplished: date,
      Notes: notes,
    }, userId);

    // End group participation (removes from active list)
    const now = new Date().toISOString();
    await this.mp!.updateTableRecords(
      'Group_Participants',
      [{ Group_Participant_ID: groupParticipantId, End_Date: now }],
      { $userId: userId }
    );

    return milestoneRecordId;
  }

  // ---------------------------------------------------------------
  // File Operations
  // ---------------------------------------------------------------

  public async getMilestoneFiles(milestoneRecordId: number): Promise<MembershipMilestoneFileInfo[]> {
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
        description: 'Uploaded via Membership Processing',
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
        description: 'Contact photo uploaded via Membership Processing',
        isDefaultImage: true,
        userId
      }
    });
  }

  // ---------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------

  private async getContactsForParticipants(
    participantIds: number[]
  ): Promise<Map<number, MembershipContactRecord>> {
    if (participantIds.length === 0) return new Map();

    const allParticipants: ParticipantRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp!.getTableRecords<ParticipantRecord>({
        table: 'Participants',
        select: 'Participant_ID,Contact_ID',
        filter: `Participant_ID IN (${batchIds.join(',')})`
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
        filter: `Contact_ID IN (${batchIds.join(',')})`
      });
      allContacts.push(...batch);
    }

    const contactMap = new Map(allContacts.map(c => [c.Contact_ID, c]));
    const result = new Map<number, MembershipContactRecord>();

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
    contacts: Map<number, MembershipContactRecord>
  ): MembershipApplicantInfo[] {
    const applicants: MembershipApplicantInfo[] = [];

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
    applicants: MembershipApplicantInfo[]
  ): Promise<MembershipCard[]> {
    const participantIds = [...new Set(applicants.map(a => a.Participant_ID))];
    const milestones = await this.fetchMilestones(participantIds);

    return applicants.map(applicant => {
      const checklist = this.buildChecklistForApplicant(applicant.Participant_ID, milestones);

      return {
        info: applicant,
        checklist,
        completedCount: checklist.filter(c => c.status === 'complete').length,
        totalCount: checklist.length,
        isFullyComplete: checklist.every(c => c.status === 'complete'),
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
        filter: `Milestone_ID IN (${milestoneIds.join(',')}) AND Participant_ID IN (${batchIds.join(',')})`,
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
    return ids;
  }

  private buildChecklistForApplicant(
    participantId: number,
    milestones: MilestoneRecord[]
  ): MembershipChecklistItem[] {
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

  private getWriteBackConfig(): MembershipWriteBackConfig {
    const milestoneIds: Record<string, number | null> = {};
    for (const config of MILESTONE_CONFIG) {
      milestoneIds[config.key] = getEnvId(config.envKey);
    }

    return {
      programId: getEnvId('MEMBERSHIP_PROGRAM_ID'),
      groupId: getEnvId('MEMBERSHIP_GROUP_ID'),
      registeredMemberMilestoneId: getEnvId('MEMBERSHIP_REGISTERED_MEMBER_MILESTONE_ID'),
      milestoneIds,
    };
  }
}
