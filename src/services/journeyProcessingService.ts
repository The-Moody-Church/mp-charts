import { MPHelper } from '@/lib/providers/ministry-platform';
import { sanitizeIds, sanitizeId } from '@/lib/providers/ministry-platform/utils/filter-sanitize';
import {
  JourneyParticipantInfo,
  JourneyCard,
  JourneyDetail,
  JourneyChecklistItem,
  JourneyMilestoneDetail,
  JourneyMilestoneFileInfo,
  JourneyWriteBackConfig,
} from '@/lib/dto';
import { getJourneyToolBySlug, type JourneyToolConfig } from '@/lib/journey-tools-config';
import { nowCentral } from '@/lib/processing-utils';
import { enforceScope } from '@/lib/scope-enforcement';

const BATCH_SIZE = 100;

// Raw record types from MP queries
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
  Discontinue_Journey: boolean;
}

export class JourneyProcessingService {
  private mp: MPHelper;
  private config: JourneyToolConfig;

  private constructor(config: JourneyToolConfig, mp?: MPHelper) {
    this.config = config;
    this.mp = mp || new MPHelper();
  }

  // Singleton cache keyed by slug
  private static instances = new Map<string, JourneyProcessingService>();

  public static getInstance(slug: string): JourneyProcessingService {
    const config = getJourneyToolBySlug(slug);
    if (!config || !config.enabled) {
      throw new Error(`Journey tool "${slug}" not found or disabled`);
    }

    if (!this.instances.has(slug)) {
      this.instances.set(slug, new JourneyProcessingService(config));
    }
    return this.instances.get(slug)!;
  }

  /** Clear cached service instances when config changes. */
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
   * Resolves the set of Participant_IDs this journey tool legitimately manages —
   * the same population getParticipants()/getPausedParticipants() surface. Used to
   * gate per-record access so a user of one tool cannot read or write another
   * tool's participants by passing a different (valid) ID. Mirrors the discovery
   * filters in getParticipantsForGroup / getParticipantsFromMilestones.
   */
  private async getScopedParticipantIds(): Promise<Set<number>> {
    const ids = new Set<number>();
    const { trackingGroupId, pausedGroupId, supportsPause, programId } = this.config;

    if (trackingGroupId) {
      const now = nowCentral();
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

    // Milestone-discovery mode: participants holding any of this tool's milestones
    // within the configured program (mirrors getParticipantsFromMilestones).
    const milestoneIds = this.config.milestones.map(m => m.milestoneId);
    if (this.config.pauseMilestoneId) milestoneIds.push(this.config.pauseMilestoneId);
    if (milestoneIds.length === 0) return ids;
    for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
      const batch = milestoneIds.slice(i, i + BATCH_SIZE);
      const rows = await this.mp.getTableRecords<{ Participant_ID: number }>({
        table: 'Participant_Milestones',
        select: 'Participant_ID',
        filter: `Milestone_ID IN (${sanitizeIds(batch)}) AND Program_ID = ${programId}`,
      });
      for (const r of rows) ids.add(r.Participant_ID);
    }
    return ids;
  }

  /** Throw/report (per F2_SCOPE_ENFORCEMENT) if the participant is not in tool scope. */
  private async assertParticipantInScope(participantId: number): Promise<void> {
    const scoped = await this.getScopedParticipantIds();
    enforceScope(scoped.has(participantId), `participant ${participantId} outside this journey tool`);
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

  /**
   * Determine badge flags for a participant based on their accomplished milestones
   * and the admin config's discontinuesJourney + completionBadge settings.
   */
  private getDiscontinueBadge(
    participantMilestones: MilestoneRecord[]
  ): { isDiscontinued: boolean; isCompletedByBadge: boolean } {
    const configMap = new Map(this.config.milestones.map(m => [m.milestoneId, m]));

    // Find accomplished milestones that are configured as "discontinues journey"
    const discontinueAccomplished = participantMilestones.filter(m => {
      if (!m.Date_Accomplished) return false;
      const cfg = configMap.get(m.Milestone_ID);
      return cfg?.discontinuesJourney === true;
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
  // Participants (main tracking group)
  // ---------------------------------------------------------------

  public async getParticipants(): Promise<JourneyCard[]> {
    const groupId = this.config.trackingGroupId;
    if (groupId) {
      return this.getParticipantsForGroup(groupId, false);
    }
    // Milestone-based discovery: return in-progress participants
    const result = await this.getParticipantsFromMilestones();
    return result.inProgress;
  }

  // ---------------------------------------------------------------
  // Completed Participants (milestone-based mode only)
  // ---------------------------------------------------------------

  public async getCompletedParticipants(): Promise<JourneyCard[]> {
    if (this.config.trackingGroupId) return []; // Not applicable in group mode
    const result = await this.getParticipantsFromMilestones();
    return result.completed;
  }

  // ---------------------------------------------------------------
  // Paused Participants (optional paused group)
  // ---------------------------------------------------------------

  public async getPausedParticipants(): Promise<JourneyCard[]> {
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
    groupParticipantId: number | null
  ): Promise<JourneyDetail | null> {
    // SECURITY: coerce every client-supplied ID to a positive integer before it
    // reaches a filter interpolation, defending the Contact_ID / Group_Participant_ID
    // sinks below against OData/SQL filter injection.
    contactId = sanitizeId(contactId);
    participantId = sanitizeId(participantId);
    groupParticipantId = groupParticipantId == null ? null : sanitizeId(groupParticipantId);
    // SECURITY (F2): per-record authorization. requireFeatureAccess only proves the
    // user may use this journey tool, not that this participant belongs to it — so
    // verify the participant is in this tool's scope before returning any PII.
    await this.assertParticipantInScope(participantId);
    const contacts = await this.mp.getTableRecords<ContactRecord>({
      table: 'Contacts',
      select: 'Contact_ID,First_Name,Nickname,Last_Name,dp_fileUniqueId AS Image_GUID,Email_Address,Mobile_Phone',
      filter: `Contact_ID = ${contactId}`,
      top: 1
    });

    if (contacts.length === 0) return null;
    const contact = contacts[0];

    const milestones = await this.fetchMilestones([participantId]);
    const checklist = this.buildChecklistForParticipant(participantId, milestones);

    // In milestone mode, use earliest Date_Accomplished as start date
    const startDate = groupParticipantId
      ? ''
      : milestones
          .filter(m => m.Participant_ID === participantId && m.Date_Accomplished)
          .map(m => m.Date_Accomplished!)
          .sort()[0] ?? null;

    const info: JourneyParticipantInfo = {
      Contact_ID: contactId,
      Participant_ID: participantId,
      First_Name: contact.First_Name,
      Nickname: contact.Nickname,
      Last_Name: contact.Last_Name,
      Image_GUID: contact.Image_GUID,
      Group_Participant_ID: groupParticipantId,
      Start_Date: startDate,
      Email_Address: contact.Email_Address,
      Mobile_Phone: contact.Mobile_Phone,
    };

    const pauseMilestoneId = this.config.pauseMilestoneId;
    const hasPauseMilestone = pauseMilestoneId
      ? milestones.some(
          m => m.Milestone_ID === pauseMilestoneId && m.Participant_ID === participantId && m.Date_Accomplished
        )
      : false;

    const participantMilestones = milestones.filter(m => m.Participant_ID === participantId);
    const { isDiscontinued, isCompletedByBadge } = this.getDiscontinueBadge(participantMilestones);

    const milestoneDetails: JourneyMilestoneDetail[] = participantMilestones
      .map(m => ({
        Participant_Milestone_ID: m.Participant_Milestone_ID,
        Milestone_ID: m.Milestone_ID,
        Date_Accomplished: m.Date_Accomplished,
        Notes: m.Notes,
      }));

    const writeBackConfig = this.getWriteBackConfig();

    // Check if group participant record has a future End_Date (group mode only)
    let endDate: string | null = null;
    if (groupParticipantId) {
      const gpRecords = await this.mp.getTableRecords<{ End_Date: string | null }>({
        table: 'Group_Participants',
        select: 'End_Date',
        filter: `Group_Participant_ID = ${groupParticipantId}`,
        top: 1
      });
      endDate = gpRecords[0]?.End_Date ?? null;
    }

    return {
      info,
      checklist,
      completedCount: checklist.filter(c => c.status === 'complete').length,
      totalCount: checklist.length,
      isPaused: hasPauseMilestone,
      isFullyComplete: checklist.every(c => c.status === 'complete') || isCompletedByBadge,
      isDiscontinued,
      endDate,
      milestones: milestoneDetails,
      writeBackConfig,
    };
  }

  // ---------------------------------------------------------------
  // Complete: end-date group participant in tracking group
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
  // Write-back: Create Milestone
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
    const milestoneConfig = this.config.milestones.find(m => m.milestoneId === data.Milestone_ID);
    const discontinueJourney = milestoneConfig?.discontinuesJourney === true;

    // F2: validate the numeric write fields as positive integers. (The generated
    // ParticipantMilestonesSchema can't be applied here — its Date_Accomplished is
    // z.string().datetime() but we write SQL-format dates — so it would reject valid
    // records; sanitizeId is the project's consistent ID validator.)
    const record: Record<string, unknown> = {
      ...data,
      Participant_ID: sanitizeId(data.Participant_ID),
      Milestone_ID: sanitizeId(data.Milestone_ID),
      Program_ID: sanitizeId(data.Program_ID),
      Date_Accomplished: data.Date_Accomplished || nowCentral(),
    };
    if (discontinueJourney) {
      record.Discontinue_Journey = true;
    }

    const created = await this.mp.createTableRecords(
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
    // SECURITY (F2): the milestone record must belong to a participant in this tool.
    await this.assertMilestoneRecordInScope(data.Participant_Milestone_ID);
    const record: Record<string, unknown> = {
      Participant_Milestone_ID: data.Participant_Milestone_ID,
    };
    if (data.Date_Accomplished !== undefined) record.Date_Accomplished = data.Date_Accomplished;
    if (data.Notes !== undefined) record.Notes = data.Notes;

    await this.mp.updateTableRecords('Participant_Milestones', [record], {
      $userId: userId,
    });
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
      throw new Error('This journey does not support pause/resume');
    }

    const { participantId, currentGroupParticipantId, notes, userId } = params;
    // SECURITY (F2): only pause participants this tool manages.
    await this.assertParticipantInScope(participantId);
    const { pausedGroupId, pauseMilestoneId, programId, defaultGroupRoleId } = this.config;

    if (!pausedGroupId || !pauseMilestoneId || !programId || !defaultGroupRoleId) {
      throw new Error('Journey pause configuration not complete');
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
      throw new Error('This journey does not support pause/resume');
    }

    const { participantId, currentGroupParticipantId, userId } = params;
    // SECURITY (F2): only resume participants this tool manages.
    await this.assertParticipantInScope(participantId);
    const { trackingGroupId, defaultGroupRoleId } = this.config;

    if (!trackingGroupId || !defaultGroupRoleId) {
      throw new Error('Journey resume configuration not complete');
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

  public async getMilestoneFiles(milestoneRecordId: number): Promise<JourneyMilestoneFileInfo[]> {
    // SECURITY: `milestoneRecordId` arrives from a "use server" action as a
    // type-erased React Flight argument — the `number` annotation is compile-time
    // only. Coerce it before it reaches the MP file path, and assert the record is
    // in this tool's scope so a user of tool A cannot read tool B's file metadata
    // (which includes the MP download URL). Every other ID-taking read in this
    // service already does both.
    const recordId = sanitizeId(milestoneRecordId);
    await this.assertMilestoneRecordInScope(recordId);

    const fileBaseUrl = process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL;
    const files = await this.mp.getFilesByRecord({
      table: 'Participant_Milestones',
      recordId
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
        description: `Uploaded via ${this.config.journeyName}`,
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
        description: `Contact photo uploaded via ${this.config.journeyName}`,
        isDefaultImage: true,
        userId,
      }
    });
  }

  // ---------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------

  private async getParticipantsFromMilestones(): Promise<{
    inProgress: JourneyCard[];
    completed: JourneyCard[];
  }> {
    // Step 1: Get all milestone IDs for this journey (visible + invisible + pause)
    const allMilestoneIds = this.config.milestones.map(m => m.milestoneId);
    if (this.config.pauseMilestoneId) {
      allMilestoneIds.push(this.config.pauseMilestoneId);
    }
    if (allMilestoneIds.length === 0) return { inProgress: [], completed: [] };

    // Step 2: Query Participant_Milestones for all participants who have any of these milestones
    const allRecords: MilestoneRecord[] = [];
    // Query scoped by Program_ID for performance (programId is required)
    const programFilter = `Program_ID = ${this.config.programId}`;
    for (let i = 0; i < allMilestoneIds.length; i += BATCH_SIZE) {
      const batchIds = allMilestoneIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<MilestoneRecord>({
        table: 'Participant_Milestones',
        select: 'Participant_Milestone_ID,Participant_ID,Milestone_ID,Date_Accomplished,Notes,Discontinue_Journey',
        filter: `Milestone_ID IN (${sanitizeIds(batchIds)}) AND ${programFilter}`,
        orderBy: 'Date_Accomplished DESC'
      });
      allRecords.push(...batch);
    }

    if (allRecords.length === 0) return { inProgress: [], completed: [] };

    // Step 3: Extract unique Participant_IDs
    const participantIds = [...new Set(allRecords.map(r => r.Participant_ID))];

    // Step 4: Fetch Contact records
    const contacts = await this.getContactsForParticipants(participantIds);

    // Step 5: Build participant info (no group membership)
    const inProgress: JourneyCard[] = [];
    const completed: JourneyCard[] = [];

    for (const participantId of participantIds) {
      const contact = contacts.get(participantId);
      if (!contact) continue;

      const participantMilestones = allRecords.filter(r => r.Participant_ID === participantId);

      // Earliest milestone date as Start_Date
      const earliestDate = participantMilestones
        .filter(m => m.Date_Accomplished)
        .map(m => m.Date_Accomplished!)
        .sort()[0] ?? null;

      const info: JourneyParticipantInfo = {
        Contact_ID: contact.Contact_ID,
        Participant_ID: participantId,
        First_Name: contact.First_Name,
        Nickname: contact.Nickname,
        Last_Name: contact.Last_Name,
        Image_GUID: contact.Image_GUID,
        Group_Participant_ID: null,
        Start_Date: earliestDate,
        Email_Address: contact.Email_Address,
        Mobile_Phone: contact.Mobile_Phone,
      };

      const checklist = this.buildChecklistForParticipant(participantId, allRecords);
      const { isDiscontinued, isCompletedByBadge } = this.getDiscontinueBadge(participantMilestones);
      const allVisible = checklist.every(c => c.status === 'complete');

      const card: JourneyCard = {
        info,
        checklist,
        completedCount: checklist.filter(c => c.status === 'complete').length,
        totalCount: checklist.length,
        isPaused: false,
        isFullyComplete: allVisible || isCompletedByBadge,
        isDiscontinued,
        endDate: null,
      };

      // Classify: completed if all visible milestones done OR discontinued/completed-by-badge
      if (allVisible || isDiscontinued || isCompletedByBadge) {
        completed.push(card);
      } else {
        inProgress.push(card);
      }
    }

    // Sort by last name
    inProgress.sort((a, b) => a.info.Last_Name.localeCompare(b.info.Last_Name));
    completed.sort((a, b) => a.info.Last_Name.localeCompare(b.info.Last_Name));

    return { inProgress, completed };
  }

  private async getParticipantsForGroup(groupId: number, isPaused: boolean): Promise<JourneyCard[]> {
    const now = nowCentral();

    const groupParticipants = await this.mp.getTableRecords<GroupParticipantRecord>({
      table: 'Group_Participants',
      select: 'Group_Participant_ID,Participant_ID,Group_ID,Group_Role_ID,Start_Date,End_Date',
      filter: `Group_ID = ${groupId} AND (End_Date IS NULL OR End_Date >= '${now}')`
    });

    if (groupParticipants.length === 0) return [];

    // Deduplicate by Participant_ID: prefer the record with no End_Date (active)
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
  ): JourneyParticipantInfo[] {
    const applicants: JourneyParticipantInfo[] = [];

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
    applicants: JourneyParticipantInfo[],
    isPaused: boolean,
    endDateAlerts: Map<number, string>
  ): Promise<JourneyCard[]> {
    const participantIds = [...new Set(applicants.map(a => a.Participant_ID))];
    const milestones = await this.fetchMilestones(participantIds);

    return applicants.map(applicant => {
      const checklist = this.buildChecklistForParticipant(applicant.Participant_ID, milestones);
      const participantMilestones = milestones.filter(m => m.Participant_ID === applicant.Participant_ID);
      const { isDiscontinued, isCompletedByBadge } = this.getDiscontinueBadge(participantMilestones);

      return {
        info: applicant,
        checklist,
        completedCount: checklist.filter(c => c.status === 'complete').length,
        totalCount: checklist.length,
        isPaused,
        isFullyComplete: checklist.every(c => c.status === 'complete') || isCompletedByBadge,
        isDiscontinued,
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
      const batch = await this.mp.getTableRecords<MilestoneRecord>({
        table: 'Participant_Milestones',
        select: 'Participant_Milestone_ID,Participant_ID,Milestone_ID,Date_Accomplished,Notes,Discontinue_Journey',
        filter: `Milestone_ID IN (${sanitizeIds(milestoneIds)}) AND Participant_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: 'Date_Accomplished DESC'
      });
      allResults.push(...batch);
    }
    return allResults;
  }

  private getAllMilestoneIds(): number[] {
    const ids = this.config.milestones
      .filter(m => m.visible)
      .map(m => m.milestoneId);

    // Also include pause milestone if configured
    if (this.config.pauseMilestoneId) {
      ids.push(this.config.pauseMilestoneId);
    }
    return ids;
  }

  private buildChecklistForParticipant(
    participantId: number,
    milestones: MilestoneRecord[]
  ): JourneyChecklistItem[] {
    return this.config.milestones
      .filter(m => m.visible)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(mc => {
        const milestone = milestones.find(
          m => m.Milestone_ID === mc.milestoneId && m.Participant_ID === participantId
        );
        const completed = !!milestone?.Date_Accomplished;

        return {
          key: String(mc.milestoneId),
          label: mc.label,
          milestoneId: mc.milestoneId,
          completed,
          date: milestone?.Date_Accomplished || null,
          status: completed ? 'complete' as const : 'not_started' as const,
          notes: milestone?.Notes || null,
          order: mc.sortOrder,
        };
      });
  }

  private getWriteBackConfig(): JourneyWriteBackConfig {
    const milestoneIds: Record<string, number | null> = {};
    for (const mc of this.config.milestones) {
      milestoneIds[String(mc.milestoneId)] = mc.milestoneId;
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
