import { MPHelper } from '@/lib/providers/ministry-platform';
import { sanitizeIds } from '@/lib/providers/ministry-platform/utils/filter-sanitize';
import {
  ComplianceParticipantInfo,
  ComplianceCard,
  ComplianceDetail,
  ComplianceChecklistItem,
  ComplianceMilestoneDetail,
  ComplianceMilestoneFileInfo,
  ComplianceWriteBackConfig,
} from '@/lib/dto';
import { getComplianceToolBySlug, type ComplianceToolConfig } from '@/lib/compliance-tools-config';

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

const BATCH_SIZE = 100;
const EXPIRING_SOON_DAYS = 30;

function getExpirationStatus(
  expiresDateStr: string | null
): 'complete' | 'expired' | 'expiring_soon' {
  if (!expiresDateStr) return 'complete';
  const expires = new Date(expiresDateStr);
  const now = new Date();
  if (expires < now) return 'expired';
  const soonDate = new Date();
  soonDate.setDate(soonDate.getDate() + EXPIRING_SOON_DAYS);
  if (expires < soonDate) return 'expiring_soon';
  return 'complete';
}

// Raw record types
interface GroupParticipantRecord {
  Group_Participant_ID: number;
  Participant_ID: number;
  Group_ID: number;
  Group_Role_ID: number;
  Start_Date: string;
  End_Date: string | null;
}

interface ParticipantRecord {
  Participant_ID: number;
  Contact_ID: number;
}

interface ContactRecord {
  Contact_ID: number;
  First_Name: string;
  Nickname: string | null;
  Last_Name: string;
  Image_GUID: string | null;
  Email_Address: string | null;
  Mobile_Phone: string | null;
}

interface MilestoneRecord {
  Participant_Milestone_ID: number;
  Participant_ID: number;
  Milestone_ID: number;
  Date_Accomplished: string | null;
  Notes: string | null;
}

interface BackgroundCheckRecord {
  Background_Check_ID: number;
  Contact_ID: number;
  Background_Check_Status_ID: number | null;
  Background_Check_Started: string;
  Background_Check_Returned: string | null;
  All_Clear: boolean | null;
  Background_Check_Expires: string | null;
}

interface CertificationRecord {
  Participant_Certification_ID: number;
  Participant_ID: number;
  Certification_Type_ID: number;
  Certification_Completed: string | null;
  Certification_Expires: string | null;
  Passed: boolean | null;
}

interface FormResponseRecord {
  Form_Response_ID: number;
  Form_ID: number;
  Contact_ID: number;
  Response_Date: string;
  Expires: string | null;
}

export class ComplianceProcessingService {
  private mp: MPHelper;
  private config: ComplianceToolConfig;

  private constructor(config: ComplianceToolConfig, mp?: MPHelper) {
    this.config = config;
    this.mp = mp || new MPHelper();
  }

  private static instances = new Map<string, ComplianceProcessingService>();

  public static getInstance(slug: string): ComplianceProcessingService {
    const config = getComplianceToolBySlug(slug);
    if (!config || !config.enabled) {
      throw new Error(`Compliance tool "${slug}" not found or disabled`);
    }

    if (!this.instances.has(slug)) {
      this.instances.set(slug, new ComplianceProcessingService(config));
    }
    return this.instances.get(slug)!;
  }

  public static clearCache(slug?: string): void {
    if (slug) {
      this.instances.delete(slug);
    } else {
      this.instances.clear();
    }
  }

  // ---------------------------------------------------------------
  // Participants (main tracking group or by group role)
  // ---------------------------------------------------------------

  public async getParticipants(): Promise<ComplianceCard[]> {
    const groupId = this.config.trackingGroupId;
    if (!groupId) return [];
    return this.getParticipantsForGroup(groupId, false);
  }

  public async getPausedParticipants(): Promise<ComplianceCard[]> {
    if (!this.config.supportsPause) return [];
    const groupId = this.config.pausedGroupId;
    if (!groupId) return [];
    return this.getParticipantsForGroup(groupId, true);
  }

  // ---------------------------------------------------------------
  // Detail
  // ---------------------------------------------------------------

  public async getParticipantDetail(
    contactId: number,
    participantId: number,
    groupParticipantId: number
  ): Promise<ComplianceDetail | null> {
    const contacts = await this.mp.getTableRecords<ContactRecord>({
      table: 'Contacts',
      select: 'Contact_ID,First_Name,Nickname,Last_Name,dp_fileUniqueId AS Image_GUID,Email_Address,Mobile_Phone',
      filter: `Contact_ID = ${contactId}`,
      top: 1
    });

    if (contacts.length === 0) return null;
    const contact = contacts[0];

    const info: ComplianceParticipantInfo = {
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

    // Fetch all requirement and journey milestone data in parallel
    const [bgChecks, certifications, formResponses, milestones, journeyMilestones] =
      await Promise.all([
        this.fetchBackgroundChecks([contactId]),
        this.fetchCertifications([participantId]),
        this.fetchFormResponses([contactId]),
        this.fetchRequirementMilestones([participantId]),
        this.config.journeyId ? this.fetchJourneyMilestones([participantId]) : Promise.resolve([]),
      ]);

    const checklist = this.buildChecklistForParticipant(
      contactId, participantId, bgChecks, certifications, formResponses, milestones, journeyMilestones
    );

    const milestoneDetails: ComplianceMilestoneDetail[] = [
      ...milestones.filter(m => m.Participant_ID === participantId),
      ...journeyMilestones.filter(m => m.Participant_ID === participantId),
    ].map(m => ({
      Participant_Milestone_ID: m.Participant_Milestone_ID,
      Milestone_ID: m.Milestone_ID,
      Date_Accomplished: m.Date_Accomplished,
      Notes: m.Notes,
    }));

    const writeBackConfig = this.getWriteBackConfig();

    const gpRecords = await this.mp.getTableRecords<{ End_Date: string | null }>({
      table: 'Group_Participants',
      select: 'End_Date',
      filter: `Group_Participant_ID = ${groupParticipantId}`,
      top: 1
    });
    const endDate = gpRecords[0]?.End_Date ?? null;

    const pauseMilestoneId = this.config.pauseMilestoneId;
    const hasPauseMilestone = pauseMilestoneId
      ? milestones.some(
          m => m.Milestone_ID === pauseMilestoneId && m.Participant_ID === participantId && m.Date_Accomplished
        )
      : false;

    return {
      info,
      checklist,
      completedCount: checklist.filter(c => c.status === 'complete').length,
      totalCount: checklist.length,
      isFullyCompliant: checklist.every(c => c.status === 'complete'),
      isPaused: hasPauseMilestone,
      endDate,
      groupRoleNames: [],
      milestones: milestoneDetails,
      writeBackConfig,
    };
  }

  // ---------------------------------------------------------------
  // Write-back: Milestone operations (for journey milestones)
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

    const created = await this.mp.createTableRecords(
      'Participant_Milestones', [record], { $userId: userId }
    ) as unknown as { Participant_Milestone_ID: number }[];

    return created[0].Participant_Milestone_ID;
  }

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

    await this.mp.updateTableRecords('Participant_Milestones', [record], { $userId: userId });
  }

  // ---------------------------------------------------------------
  // Pause / Resume
  // ---------------------------------------------------------------

  public async pauseParticipant(params: {
    participantId: number;
    currentGroupParticipantId: number;
    notes?: string;
    userId?: number;
  }): Promise<void> {
    if (!this.config.supportsPause) {
      throw new Error('This compliance tool does not support pause/resume');
    }

    const { participantId, currentGroupParticipantId, notes, userId } = params;
    const { pausedGroupId, pauseMilestoneId, programId, defaultGroupRoleId } = this.config;

    if (!pausedGroupId || !pauseMilestoneId || !programId || !defaultGroupRoleId) {
      throw new Error('Compliance pause configuration not complete');
    }

    await this.createMilestone({
      Participant_ID: participantId,
      Milestone_ID: pauseMilestoneId,
      Program_ID: programId,
      Notes: notes,
    }, userId);

    const now = nowCentral();
    await this.mp.updateTableRecords(
      'Group_Participants',
      [{ Group_Participant_ID: currentGroupParticipantId, End_Date: now }],
      { $userId: userId }
    );

    await this.mp.createTableRecords(
      'Group_Participants',
      [{
        Group_ID: pausedGroupId,
        Participant_ID: participantId,
        Group_Role_ID: defaultGroupRoleId,
        Start_Date: now,
      }],
      { $userId: userId }
    );
  }

  public async resumeParticipant(params: {
    participantId: number;
    currentGroupParticipantId: number;
    userId?: number;
  }): Promise<void> {
    if (!this.config.supportsPause) {
      throw new Error('This compliance tool does not support pause/resume');
    }

    const { participantId, currentGroupParticipantId, userId } = params;
    const { trackingGroupId, defaultGroupRoleId } = this.config;

    if (!trackingGroupId || !defaultGroupRoleId) {
      throw new Error('Compliance resume configuration not complete');
    }

    const now = nowCentral();
    await this.mp.updateTableRecords(
      'Group_Participants',
      [{ Group_Participant_ID: currentGroupParticipantId, End_Date: now }],
      { $userId: userId }
    );

    await this.mp.createTableRecords(
      'Group_Participants',
      [{
        Group_ID: trackingGroupId,
        Participant_ID: participantId,
        Group_Role_ID: defaultGroupRoleId,
        Start_Date: now,
      }],
      { $userId: userId }
    );
  }

  // ---------------------------------------------------------------
  // File Operations
  // ---------------------------------------------------------------

  public async getMilestoneFiles(milestoneRecordId: number): Promise<ComplianceMilestoneFileInfo[]> {
    const fileBaseUrl = process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL;
    const files = await this.mp.getFilesByRecord({
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
        isImage: f.IsImage,
      };
    });
  }

  public async uploadDocument(
    table: string,
    recordId: number,
    files: File[],
    userId?: number
  ): Promise<void> {
    await this.mp.uploadFiles({
      table,
      recordId,
      files,
      uploadParams: {
        description: `Uploaded via ${this.config.toolName}`,
        userId,
      }
    });
  }

  public async uploadContactPhoto(
    contactId: number,
    file: File,
    userId?: number
  ): Promise<void> {
    await this.mp.uploadFiles({
      table: 'Contacts',
      recordId: contactId,
      files: [file],
      uploadParams: {
        description: `Contact photo uploaded via ${this.config.toolName}`,
        isDefaultImage: true,
        userId,
      }
    });
  }

  // ---------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------

  private async getParticipantsForGroup(groupId: number, isPaused: boolean): Promise<ComplianceCard[]> {
    const now = nowCentral();

    const groupParticipants = await this.mp.getTableRecords<GroupParticipantRecord>({
      table: 'Group_Participants',
      select: 'Group_Participant_ID,Participant_ID,Group_ID,Group_Role_ID,Start_Date,End_Date',
      filter: `Group_ID = ${groupId} AND (End_Date IS NULL OR End_Date >= '${now}')`
    });

    if (groupParticipants.length === 0) return [];

    // Deduplicate by Participant_ID
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

    const participantsWithNullEndDate = new Set(
      groupParticipants.filter(gp => gp.End_Date === null).map(gp => gp.Participant_ID)
    );

    const deduped = [...bestByParticipant.values()];

    const endDateAlerts = new Map<number, string>();
    for (const gp of deduped) {
      if (!participantsWithNullEndDate.has(gp.Participant_ID) && gp.End_Date) {
        endDateAlerts.set(gp.Participant_ID, gp.End_Date);
      }
    }

    const participantIds = deduped.map(gp => gp.Participant_ID);
    const contacts = await this.getContactsForParticipants(participantIds);

    const applicants = this.buildParticipantInfoList(deduped, contacts);
    if (applicants.length === 0) return [];

    return this.assembleParticipantCards(applicants, isPaused, endDateAlerts);
  }

  private async getContactsForParticipants(
    participantIds: number[]
  ): Promise<Map<number, ContactRecord & { Participant_ID: number }>> {
    if (participantIds.length === 0) return new Map();

    const allParticipants: ParticipantRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<ParticipantRecord>({
        table: 'Participants',
        select: 'Participant_ID,Contact_ID',
        filter: `Participant_ID IN (${sanitizeIds(batchIds)})`
      });
      allParticipants.push(...batch);
    }

    const contactIds = [...new Set(allParticipants.map(p => p.Contact_ID))];
    if (contactIds.length === 0) return new Map();

    const allContacts: ContactRecord[] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batchIds = contactIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<ContactRecord>({
        table: 'Contacts',
        select: 'Contact_ID,First_Name,Nickname,Last_Name,dp_fileUniqueId AS Image_GUID,Email_Address,Mobile_Phone',
        filter: `Contact_ID IN (${sanitizeIds(batchIds)})`
      });
      allContacts.push(...batch);
    }

    const contactMap = new Map(allContacts.map(c => [c.Contact_ID, c]));
    const result = new Map<number, ContactRecord & { Participant_ID: number }>();

    for (const p of allParticipants) {
      const contact = contactMap.get(p.Contact_ID);
      if (contact) {
        result.set(p.Participant_ID, { ...contact, Participant_ID: p.Participant_ID });
      }
    }

    return result;
  }

  private buildParticipantInfoList(
    groupParticipants: GroupParticipantRecord[],
    contacts: Map<number, ContactRecord & { Participant_ID: number }>
  ): ComplianceParticipantInfo[] {
    const applicants: ComplianceParticipantInfo[] = [];

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

  private async assembleParticipantCards(
    applicants: ComplianceParticipantInfo[],
    isPaused: boolean,
    endDateAlerts: Map<number, string>
  ): Promise<ComplianceCard[]> {
    const participantIds = [...new Set(applicants.map(a => a.Participant_ID))];
    const contactIds = [...new Set(applicants.map(a => a.Contact_ID))];

    // Fetch all data in parallel
    const [bgChecks, certifications, formResponses, milestones, journeyMilestones] =
      await Promise.all([
        this.fetchBackgroundChecks(contactIds),
        this.fetchCertifications(participantIds),
        this.fetchFormResponses(contactIds),
        this.fetchRequirementMilestones(participantIds),
        this.config.journeyId ? this.fetchJourneyMilestones(participantIds) : Promise.resolve([]),
      ]);

    return applicants.map(applicant => {
      const checklist = this.buildChecklistForParticipant(
        applicant.Contact_ID, applicant.Participant_ID,
        bgChecks, certifications, formResponses, milestones, journeyMilestones
      );

      return {
        info: applicant,
        checklist,
        completedCount: checklist.filter(c => c.status === 'complete').length,
        totalCount: checklist.length,
        isFullyCompliant: checklist.every(c => c.status === 'complete'),
        isPaused,
        endDate: endDateAlerts.get(applicant.Participant_ID) ?? null,
        groupRoleNames: [],
      };
    });
  }

  // ---------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------

  private async fetchBackgroundChecks(contactIds: number[]): Promise<BackgroundCheckRecord[]> {
    if (contactIds.length === 0) return [];
    const allResults: BackgroundCheckRecord[] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batchIds = contactIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<BackgroundCheckRecord>({
        table: 'Background_Checks',
        select: 'Background_Check_ID,Contact_ID,Background_Check_Status_ID,Background_Check_Started,Background_Check_Returned,All_Clear,Background_Check_Expires',
        filter: `Contact_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: 'Background_Check_Started DESC',
      });
      allResults.push(...batch);
    }
    return allResults;
  }

  private async fetchCertifications(participantIds: number[]): Promise<CertificationRecord[]> {
    if (participantIds.length === 0) return [];
    const allResults: CertificationRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<CertificationRecord>({
        table: 'Participant_Certifications',
        select: 'Participant_Certification_ID,Participant_ID,Certification_Type_ID,Certification_Completed,Certification_Expires,Passed',
        filter: `Participant_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: 'Certification_Completed DESC',
      });
      allResults.push(...batch);
    }
    return allResults;
  }

  private async fetchFormResponses(contactIds: number[]): Promise<FormResponseRecord[]> {
    if (contactIds.length === 0) return [];
    const allResults: FormResponseRecord[] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batchIds = contactIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<FormResponseRecord>({
        table: 'Form_Responses',
        select: 'Form_Response_ID,Form_ID,Contact_ID,Response_Date,Expires',
        filter: `Contact_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: 'Response_Date DESC',
      });
      allResults.push(...batch);
    }
    return allResults;
  }

  private async fetchRequirementMilestones(participantIds: number[]): Promise<MilestoneRecord[]> {
    const milestoneIds = this.config.requirements
      .filter(r => r.visible && r.type === 'milestone')
      .map(r => r.requirementId);

    // Also include pause milestone
    if (this.config.pauseMilestoneId) {
      milestoneIds.push(this.config.pauseMilestoneId);
    }

    if (milestoneIds.length === 0 || participantIds.length === 0) return [];

    const allResults: MilestoneRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<MilestoneRecord>({
        table: 'Participant_Milestones',
        select: 'Participant_Milestone_ID,Participant_ID,Milestone_ID,Date_Accomplished,Notes',
        filter: `Milestone_ID IN (${sanitizeIds(milestoneIds)}) AND Participant_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: 'Date_Accomplished DESC',
      });
      allResults.push(...batch);
    }
    return allResults;
  }

  private async fetchJourneyMilestones(participantIds: number[]): Promise<MilestoneRecord[]> {
    const milestoneIds = this.config.journeyMilestones
      .filter(m => m.visible)
      .map(m => m.milestoneId);

    if (milestoneIds.length === 0 || participantIds.length === 0) return [];

    const allResults: MilestoneRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<MilestoneRecord>({
        table: 'Participant_Milestones',
        select: 'Participant_Milestone_ID,Participant_ID,Milestone_ID,Date_Accomplished,Notes',
        filter: `Milestone_ID IN (${sanitizeIds(milestoneIds)}) AND Participant_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: 'Date_Accomplished DESC',
      });
      allResults.push(...batch);
    }
    return allResults;
  }

  // ---------------------------------------------------------------
  // Checklist Builder
  // ---------------------------------------------------------------

  private buildChecklistForParticipant(
    contactId: number,
    participantId: number,
    bgChecks: BackgroundCheckRecord[],
    certifications: CertificationRecord[],
    formResponses: FormResponseRecord[],
    milestones: MilestoneRecord[],
    journeyMilestones: MilestoneRecord[],
  ): ComplianceChecklistItem[] {
    const items: ComplianceChecklistItem[] = [];

    // Build items from requirements config
    for (const req of this.config.requirements.filter(r => r.visible).sort((a, b) => a.sortOrder - b.sortOrder)) {
      switch (req.type) {
        case 'background_check': {
          const latestBg = bgChecks.find(bc => bc.Contact_ID === contactId);
          const completed = latestBg?.All_Clear === true;
          const expires = latestBg?.Background_Check_Expires ?? null;
          const status = !completed ? 'not_started' : getExpirationStatus(expires);
          items.push({
            key: `req-${req.requirementId}`,
            label: req.label,
            type: 'background_check',
            completed: status === 'complete',
            date: latestBg?.Background_Check_Returned ?? latestBg?.Background_Check_Started ?? null,
            expires,
            status,
            detail: latestBg ? (latestBg.All_Clear ? 'All Clear' : 'Pending') : null,
            order: req.sortOrder,
          });
          break;
        }
        case 'certification': {
          const latestCert = certifications.find(
            c => c.Participant_ID === participantId && c.Certification_Type_ID === req.requirementId
          );
          const completed = !!latestCert?.Certification_Completed && latestCert.Passed !== false;
          const expires = latestCert?.Certification_Expires ?? null;
          const status = !completed ? 'not_started' : getExpirationStatus(expires);
          items.push({
            key: `req-${req.requirementId}`,
            label: req.label,
            type: 'certification',
            completed: status === 'complete',
            date: latestCert?.Certification_Completed ?? null,
            expires,
            status,
            detail: latestCert?.Passed === false ? 'Failed' : null,
            order: req.sortOrder,
          });
          break;
        }
        case 'milestone': {
          const milestone = milestones.find(
            m => m.Milestone_ID === req.requirementId && m.Participant_ID === participantId
          );
          const completed = !!milestone?.Date_Accomplished;
          items.push({
            key: `req-${req.requirementId}`,
            label: req.label,
            type: 'milestone',
            completed,
            date: milestone?.Date_Accomplished ?? null,
            expires: null,
            status: completed ? 'complete' : 'not_started',
            detail: null,
            order: req.sortOrder,
          });
          break;
        }
        case 'form': {
          const latestForm = formResponses.find(
            f => f.Contact_ID === contactId && f.Form_ID === req.requirementId
          );
          const completed = !!latestForm;
          const expires = latestForm?.Expires ?? null;
          const status = !completed ? 'not_started' : getExpirationStatus(expires);
          items.push({
            key: `req-${req.requirementId}`,
            label: req.label,
            type: 'form',
            completed: status === 'complete',
            date: latestForm?.Response_Date ?? null,
            expires,
            status,
            detail: null,
            order: req.sortOrder,
          });
          break;
        }
      }
    }

    // Build items from journey milestones (if journey attached)
    for (const jm of this.config.journeyMilestones.filter(m => m.visible).sort((a, b) => a.sortOrder - b.sortOrder)) {
      const milestone = journeyMilestones.find(
        m => m.Milestone_ID === jm.milestoneId && m.Participant_ID === participantId
      );
      const completed = !!milestone?.Date_Accomplished;
      items.push({
        key: `jm-${jm.milestoneId}`,
        label: jm.label,
        type: 'journey_milestone',
        completed,
        date: milestone?.Date_Accomplished ?? null,
        expires: null,
        status: completed ? 'complete' : 'not_started',
        detail: null,
        order: jm.sortOrder + 1000, // Sort after requirements
      });
    }

    return items.sort((a, b) => a.order - b.order);
  }

  private getWriteBackConfig(): ComplianceWriteBackConfig {
    const milestoneIds: Record<string, number | null> = {};

    // Journey milestones
    for (const jm of this.config.journeyMilestones) {
      milestoneIds[`jm-${jm.milestoneId}`] = jm.milestoneId;
    }

    // Requirement milestones
    for (const req of this.config.requirements.filter(r => r.type === 'milestone')) {
      milestoneIds[`req-${req.requirementId}`] = req.requirementId;
    }

    return {
      programId: this.config.programId,
      trackingGroupId: this.config.trackingGroupId,
      pausedGroupId: this.config.pausedGroupId,
      defaultGroupRoleId: this.config.defaultGroupRoleId,
      pauseMilestoneId: this.config.pauseMilestoneId,
      supportsPause: this.config.supportsPause,
      milestoneIds,
    };
  }
}
