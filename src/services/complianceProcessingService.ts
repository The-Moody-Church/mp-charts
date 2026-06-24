import { MPHelper } from '@/lib/providers/ministry-platform';
import { sanitizeIds, sanitizeId } from '@/lib/providers/ministry-platform/utils/filter-sanitize';
import {
  ComplianceParticipantInfo,
  ComplianceCard,
  ComplianceDetail,
  ComplianceChecklistItem,
  ComplianceMilestoneDetail,
  ComplianceMilestoneFileInfo,
  ComplianceWriteBackConfig,
  BackgroundCheckDetail,
} from '@/lib/dto';
import { getComplianceToolBySlug, type ComplianceToolConfig } from '@/lib/compliance-tools-config';
import { nowCentral } from '@/lib/processing-utils';
import { enforceScope } from '@/lib/scope-enforcement';

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
  Background_Check_Submitted: string | null;
  Background_Check_Returned: string | null;
  All_Clear: boolean | null;
  Background_Check_Expires: string | null;
  Report_Url: string | null;
  Background_Check_Type_ID: number | null;
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
  // Per-record scope authorization (F2)
  // ---------------------------------------------------------------

  /**
   * Resolves the set of Participant_IDs this compliance tool legitimately manages
   * — the same population getParticipants()/getPausedParticipants() surface. Used
   * to gate per-record access so a user of one tool cannot read or write another
   * tool's participants by passing a different (valid) ID. Mirrors the discovery
   * filters in getParticipantsForGroup / getParticipantsByGroupRole.
   */
  private async getScopedParticipantIds(): Promise<Set<number>> {
    const ids = new Set<number>();
    const now = nowCentral();
    const { trackingGroupId, pausedGroupId, supportsPause, groupRoleIds } = this.config;

    if (trackingGroupId) {
      const groupIds = [trackingGroupId];
      if (supportsPause && pausedGroupId) groupIds.push(pausedGroupId);
      const rows = await this.mp.getTableRecords<{ Participant_ID: number }>({
        table: 'Group_Participants',
        select: 'Participant_ID',
        filter: `Group_ID IN (${sanitizeIds(groupIds)}) AND (End_Date IS NULL OR End_Date >= '${now}')`,
      });
      for (const r of rows) ids.add(r.Participant_ID);
      return ids;
    }

    // Group-role mode: members holding any of the configured group roles (mirrors
    // getParticipantsByGroupRole).
    if (groupRoleIds.length > 0) {
      for (let i = 0; i < groupRoleIds.length; i += BATCH_SIZE) {
        const batch = groupRoleIds.slice(i, i + BATCH_SIZE);
        const rows = await this.mp.getTableRecords<{ Participant_ID: number }>({
          table: 'Group_Participants',
          select: 'Participant_ID',
          filter: `Group_Role_ID IN (${sanitizeIds(batch)}) AND Start_Date <= '${now}' AND (End_Date IS NULL OR End_Date >= '${now}')`,
        });
        for (const r of rows) ids.add(r.Participant_ID);
      }
    }
    return ids;
  }

  /** Throw/report (per F2_SCOPE_ENFORCEMENT) if the participant is not in tool scope. */
  private async assertParticipantInScope(participantId: number): Promise<void> {
    const scoped = await this.getScopedParticipantIds();
    enforceScope(scoped.has(participantId), `participant ${participantId} outside this compliance tool`);
  }

  /** Assert scope for a contact by resolving its participant record(s). */
  private async assertContactInScope(contactId: number): Promise<void> {
    const parts = await this.mp.getTableRecords<{ Participant_ID: number }>({
      table: 'Participants',
      select: 'Participant_ID',
      filter: `Contact_ID = ${sanitizeId(contactId)}`,
    });
    const scoped = await this.getScopedParticipantIds();
    enforceScope(parts.some(p => scoped.has(p.Participant_ID)), `contact ${contactId} outside this compliance tool`);
  }

  /** Resolve a Group_Participant record to its Participant_ID, then assert scope. */
  private async assertGroupParticipantInScope(groupParticipantId: number): Promise<void> {
    const rows = await this.mp.getTableRecords<{ Participant_ID: number }>({
      table: 'Group_Participants',
      select: 'Participant_ID',
      filter: `Group_Participant_ID = ${sanitizeId(groupParticipantId)}`,
      top: 1,
    });
    if (!rows[0]) { enforceScope(false, `group-participant ${groupParticipantId} not found`); return; }
    await this.assertParticipantInScope(rows[0].Participant_ID);
  }

  /** Resolve a Participant_Milestone record to its Participant_ID, then assert scope. */
  private async assertMilestoneRecordInScope(participantMilestoneId: number): Promise<void> {
    const rows = await this.mp.getTableRecords<{ Participant_ID: number }>({
      table: 'Participant_Milestones',
      select: 'Participant_ID',
      filter: `Participant_Milestone_ID = ${sanitizeId(participantMilestoneId)}`,
      top: 1,
    });
    if (!rows[0]) { enforceScope(false, `milestone ${participantMilestoneId} not found`); return; }
    await this.assertParticipantInScope(rows[0].Participant_ID);
  }

  // ---------------------------------------------------------------
  // Discontinue / Complete badge logic
  // ---------------------------------------------------------------

  private getDiscontinueBadge(
    participantMilestones: MilestoneRecord[]
  ): { isDiscontinued: boolean; isCompletedByBadge: boolean } {
    const configMap = new Map(this.config.journeyMilestones.map(m => [m.milestoneId, m]));

    // Find accomplished milestones that are configured as "discontinues journey"
    const discontinueAccomplished = participantMilestones.filter(m => {
      const cfg = configMap.get(m.Milestone_ID);
      return cfg?.discontinuesJourney && m.Date_Accomplished;
    });

    if (discontinueAccomplished.length === 0) {
      return { isDiscontinued: false, isCompletedByBadge: false };
    }

    const hasCompletedBadge = discontinueAccomplished.some(m => {
      const cfg = configMap.get(m.Milestone_ID);
      return cfg?.completionBadge === "completed";
    });
    return {
      isDiscontinued: !hasCompletedBadge,
      isCompletedByBadge: hasCompletedBadge,
    };
  }

  // ---------------------------------------------------------------
  // Participants (main tracking group or by group role)
  // ---------------------------------------------------------------

  public async getParticipants(): Promise<ComplianceCard[]> {
    const groupId = this.config.trackingGroupId;
    if (groupId) return this.getParticipantsForGroup(groupId, false);

    // No tracking group — fall back to querying by group role IDs
    if (this.config.groupRoleIds.length === 0) return [];
    return this.getParticipantsByGroupRole(this.config.groupRoleIds);
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
    // SECURITY: coerce every client-supplied ID to a positive integer before it
    // reaches a filter interpolation, defending the Contact_ID / Group_Participant_ID
    // sinks below against OData/SQL filter injection.
    contactId = sanitizeId(contactId);
    participantId = sanitizeId(participantId);
    groupParticipantId = sanitizeId(groupParticipantId);
    // SECURITY (F2): per-record authorization. requireFeatureAccess only proves the
    // user may use this compliance tool, not that this participant belongs to it —
    // verify scope before returning any PII (incl. background-check/compliance data).
    await this.assertParticipantInScope(participantId);
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

    const bgTypeNames = await this.fetchBgCheckTypeNames(bgChecks);

    const checklist = this.buildChecklistForParticipant(
      contactId, participantId, bgChecks, certifications, formResponses, milestones, journeyMilestones, bgTypeNames
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

    const participantJourneyMilestones = journeyMilestones.filter(m => m.Participant_ID === participantId);
    const { isDiscontinued, isCompletedByBadge } = this.getDiscontinueBadge(participantJourneyMilestones);

    return {
      info,
      checklist,
      completedCount: checklist.filter(c => c.status === 'complete').length,
      totalCount: checklist.length,
      isFullyCompliant: checklist.every(c => c.status === 'complete') || isCompletedByBadge,
      isDiscontinued,
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
    // SECURITY (F2): only write milestones for participants this tool manages.
    await this.assertParticipantInScope(data.Participant_ID);
    // Check if this milestone is configured to discontinue the journey
    const milestoneConfig = this.config.journeyMilestones.find(m => m.milestoneId === data.Milestone_ID);
    const discontinueJourney = milestoneConfig?.discontinuesJourney === true;

    const record: Record<string, unknown> = {
      ...data,
      Date_Accomplished: data.Date_Accomplished || nowCentral(),
    };
    if (discontinueJourney) {
      record.Discontinue_Journey = true;
    }

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
    // SECURITY (F2): the milestone record must belong to a participant in this tool.
    await this.assertMilestoneRecordInScope(data.Participant_Milestone_ID);
    const record: Record<string, unknown> = {
      Participant_Milestone_ID: data.Participant_Milestone_ID,
    };
    if (data.Date_Accomplished !== undefined) record.Date_Accomplished = data.Date_Accomplished;
    if (data.Notes !== undefined) record.Notes = data.Notes;

    await this.mp.updateTableRecords('Participant_Milestones', [record], { $userId: userId });
  }

  public async createCertification(data: {
    Participant_ID: number;
    Certification_Type_ID: number;
    Certification_Completed: string;
    Notes?: string;
  }, userId?: number): Promise<number> {
    // SECURITY (F2): only write certifications for participants this tool manages.
    await this.assertParticipantInScope(data.Participant_ID);
    const record: Record<string, unknown> = {
      Participant_ID: data.Participant_ID,
      Certification_Type_ID: data.Certification_Type_ID,
      Certification_Submitted: nowCentral(),
      Certification_Completed: data.Certification_Completed,
    };
    if (data.Notes) record.Notes = data.Notes;

    const created = await this.mp.createTableRecords(
      'Participant_Certifications', [record], { $userId: userId }
    ) as unknown as { Participant_Certification_ID: number }[];

    return created[0].Participant_Certification_ID;
  }

  public async createFormResponse(data: {
    Form_ID: number;
    Contact_ID: number;
    Response_Date: string;
  }, userId?: number): Promise<number> {
    // SECURITY (F2): the contact must map to a participant this tool manages.
    await this.assertContactInScope(data.Contact_ID);
    const record: Record<string, unknown> = {
      Form_ID: data.Form_ID,
      Contact_ID: data.Contact_ID,
      Response_Date: data.Response_Date || nowCentral(),
    };

    const created = await this.mp.createTableRecords(
      'Form_Responses', [record], { $userId: userId }
    ) as unknown as { Form_Response_ID: number }[];

    return created[0].Form_Response_ID;
  }

  // ---------------------------------------------------------------
  // Complete (remove from tracking group)
  // ---------------------------------------------------------------

  public async completeParticipant(params: {
    currentGroupParticipantId: number;
    userId?: number;
  }): Promise<void> {
    const { currentGroupParticipantId, userId } = params;

    if (!this.config.trackingGroupId) {
      throw new Error('Complete requires a tracking group');
    }

    // SECURITY (F2): the group-participant record must belong to this tool.
    await this.assertGroupParticipantInScope(currentGroupParticipantId);

    const now = nowCentral();
    await this.mp.updateTableRecords(
      'Group_Participants',
      [{ Group_Participant_ID: currentGroupParticipantId, End_Date: now }],
      { $userId: userId }
    );
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
    // SECURITY (F2): only pause participants this tool manages.
    await this.assertParticipantInScope(participantId);
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
    // SECURITY (F2): only resume participants this tool manages.
    await this.assertParticipantInScope(participantId);
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

  public async getRecordFiles(table: string, recordId: number): Promise<ComplianceMilestoneFileInfo[]> {
    const fileBaseUrl = process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL;
    const files = await this.mp.getFilesByRecord({ table, recordId });

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

  public async getMilestoneFiles(milestoneRecordId: number): Promise<ComplianceMilestoneFileInfo[]> {
    return this.getRecordFiles('Participant_Milestones', milestoneRecordId);
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

  private async getParticipantsByGroupRole(groupRoleIds: number[]): Promise<ComplianceCard[]> {
    const now = nowCentral();

    const allGroupParticipants: GroupParticipantRecord[] = [];
    for (let i = 0; i < groupRoleIds.length; i += BATCH_SIZE) {
      const batchIds = groupRoleIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<GroupParticipantRecord>({
        table: 'Group_Participants',
        select: 'Group_Participant_ID,Participant_ID,Group_ID,Group_Role_ID,Start_Date,End_Date',
        filter: `Group_Role_ID IN (${sanitizeIds(batchIds)}) AND Start_Date <= '${now}' AND (End_Date IS NULL OR End_Date >= '${now}')`,
      });
      allGroupParticipants.push(...batch);
    }

    if (allGroupParticipants.length === 0) return [];

    // Deduplicate by Participant_ID (keep record with null End_Date or latest End_Date)
    const bestByParticipant = new Map<number, GroupParticipantRecord>();
    for (const gp of allGroupParticipants) {
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
      allGroupParticipants.filter(gp => gp.End_Date === null).map(gp => gp.Participant_ID)
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

    // Build map of Participant_ID → Set of Group_IDs (before dedup, to capture all groups)
    const groupIdsByParticipant = new Map<number, Set<number>>();
    for (const gp of allGroupParticipants) {
      const set = groupIdsByParticipant.get(gp.Participant_ID) ?? new Set();
      set.add(gp.Group_ID);
      groupIdsByParticipant.set(gp.Participant_ID, set);
    }

    // Fetch group names
    const allGroupIds = [...new Set(allGroupParticipants.map(gp => gp.Group_ID))];
    const groupNames = await this.fetchGroupNames(allGroupIds);

    const cards = await this.assembleParticipantCards(applicants, false, endDateAlerts);

    // Populate groupRoleNames from the group name lookup
    for (const card of cards) {
      const gIds = groupIdsByParticipant.get(card.info.Participant_ID);
      if (gIds) {
        card.groupRoleNames = [...gIds]
          .map(id => groupNames.get(id))
          .filter((n): n is string => !!n)
          .sort();
      }
    }

    return cards;
  }

  private async fetchGroupNames(groupIds: number[]): Promise<Map<number, string>> {
    if (groupIds.length === 0) return new Map();
    const allGroups: { Group_ID: number; Group_Name: string }[] = [];
    for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
      const batchIds = groupIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<{ Group_ID: number; Group_Name: string }>({
        table: 'Groups',
        select: 'Group_ID,Group_Name',
        filter: `Group_ID IN (${sanitizeIds(batchIds)})`,
      });
      allGroups.push(...batch);
    }
    return new Map(allGroups.map(g => [g.Group_ID, g.Group_Name]));
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

    const bgTypeNames = await this.fetchBgCheckTypeNames(bgChecks);

    return applicants.map(applicant => {
      const checklist = this.buildChecklistForParticipant(
        applicant.Contact_ID, applicant.Participant_ID,
        bgChecks, certifications, formResponses, milestones, journeyMilestones, bgTypeNames
      );

      const participantJourneyMilestones = journeyMilestones.filter(m => m.Participant_ID === applicant.Participant_ID);
      const { isDiscontinued, isCompletedByBadge } = this.getDiscontinueBadge(participantJourneyMilestones);

      return {
        info: applicant,
        checklist,
        completedCount: checklist.filter(c => c.status === 'complete').length,
        totalCount: checklist.length,
        isFullyCompliant: checklist.every(c => c.status === 'complete') || isCompletedByBadge,
        isDiscontinued,
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
        select: 'Background_Check_ID,Contact_ID,Background_Check_Status_ID,Background_Check_Started,Background_Check_Submitted,Background_Check_Returned,All_Clear,Background_Check_Expires,Report_Url,Background_Check_Type_ID',
        filter: `Contact_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: 'Background_Check_Started DESC',
      });
      allResults.push(...batch);
    }
    return allResults;
  }

  private async fetchBgCheckTypeNames(bgChecks: BackgroundCheckRecord[]): Promise<Map<number, string>> {
    const typeIds = [...new Set(bgChecks.map(b => b.Background_Check_Type_ID).filter((id): id is number => id !== null))];
    if (typeIds.length === 0) return new Map();
    const types = await this.mp.getTableRecords<{ Background_Check_Type_ID: number; Background_Check_Type: string }>({
      table: 'Background_Check_Types',
      select: 'Background_Check_Type_ID,Background_Check_Type',
      filter: `Background_Check_Type_ID IN (${sanitizeIds(typeIds)})`,
    });
    return new Map(types.map(t => [t.Background_Check_Type_ID, t.Background_Check_Type]));
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
    bgTypeNames: Map<number, string> = new Map(),
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

          let bgDetail: BackgroundCheckDetail | null = null;
          if (latestBg) {
            // Derive status text from available fields
            let bgStatus = 'Pending';
            if (latestBg.All_Clear === true && latestBg.Background_Check_Returned) bgStatus = 'Completed';
            else if (latestBg.Background_Check_Returned) bgStatus = 'Returned';
            else if (latestBg.Background_Check_Submitted) bgStatus = 'Submitted';
            else bgStatus = 'Started';

            bgDetail = {
              typeName: latestBg.Background_Check_Type_ID ? (bgTypeNames.get(latestBg.Background_Check_Type_ID) ?? null) : null,
              status: bgStatus,
              started: latestBg.Background_Check_Started,
              submitted: latestBg.Background_Check_Submitted,
              returned: latestBg.Background_Check_Returned,
              allClear: latestBg.All_Clear,
              expires: latestBg.Background_Check_Expires,
              reportUrl: latestBg.Report_Url,
            };
          }

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
            recordId: latestBg?.Background_Check_ID ?? null,
            bgCheckDetail: bgDetail,
          });
          break;
        }
        case 'certification': {
          const latestCert = certifications.find(
            c => c.Participant_ID === participantId && c.Certification_Type_ID === req.requirementId
          );
          const completed = !!latestCert?.Certification_Completed && latestCert.Passed !== false;
          const expires = latestCert?.Certification_Expires ?? null;
          const status = completed
            ? getExpirationStatus(expires)
            : latestCert ? 'in_progress' : 'not_started';
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
            recordId: latestCert?.Participant_Certification_ID ?? null,
            bgCheckDetail: null,
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
            recordId: milestone?.Participant_Milestone_ID ?? null,
            bgCheckDetail: null,
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
            recordId: latestForm?.Form_Response_ID ?? null,
            bgCheckDetail: null,
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
        recordId: milestone?.Participant_Milestone_ID ?? null,
        bgCheckDetail: null,
      });
    }

    return items.sort((a, b) => a.order - b.order);
  }

  private getWriteBackConfig(): ComplianceWriteBackConfig {
    const milestoneIds: Record<string, number | null> = {};
    const certificationTypeIds: Record<string, number | null> = {};
    const formIds: Record<string, number | null> = {};

    // Journey milestones
    for (const jm of this.config.journeyMilestones) {
      milestoneIds[`jm-${jm.milestoneId}`] = jm.milestoneId;
    }

    // Requirements by type
    for (const req of this.config.requirements) {
      switch (req.type) {
        case 'milestone':
          milestoneIds[`req-${req.requirementId}`] = req.requirementId;
          break;
        case 'certification':
          certificationTypeIds[`req-${req.requirementId}`] = req.requirementId;
          break;
        case 'form':
          formIds[`req-${req.requirementId}`] = req.requirementId;
          break;
      }
    }

    return {
      programId: this.config.programId,
      trackingGroupId: this.config.trackingGroupId,
      pausedGroupId: this.config.pausedGroupId,
      defaultGroupRoleId: this.config.defaultGroupRoleId,
      pauseMilestoneId: this.config.pauseMilestoneId,
      supportsPause: this.config.supportsPause,
      milestoneIds,
      certificationTypeIds,
      formIds,
    };
  }
}
