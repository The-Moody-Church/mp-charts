import { TransitionPayload, STATUS_TO_MILESTONE, MEMBERSHIP_JOURNEY_ID, MEMBERSHIP_PROGRAM_ID } from "@/lib/dto";
import type { MemberMilestone, BaseFileInfo } from "@/lib/dto";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeId, sanitizeIds } from "@/lib/providers/ministry-platform/utils/filter-sanitize";
import { nowCentral } from "@/lib/processing-utils";

/** Member status lookup row. */
interface MemberStatusRow {
  Member_Status_ID: number;
  Member_Status: string;
}

/** Raw row from Participant_Milestones with joined Milestone_Title. */
interface MilestoneRow {
  Participant_Milestone_ID: number;
  Milestone_ID: number;
  Milestone_Title: string;
  Date_Accomplished: string | null;
  Notes: string | null;
}

export class MemberService {
  private static instance: MemberService;
  private mp: MPHelper | null = null;

  private constructor() {}

  public static async getInstance(accessToken?: string): Promise<MemberService> {
    if (accessToken) {
      const instance = new MemberService();
      instance.mp = new MPHelper({ accessToken });
      return instance;
    }
    if (!MemberService.instance) {
      MemberService.instance = new MemberService();
      MemberService.instance.mp = new MPHelper();
    }
    return MemberService.instance;
  }

  // ---------------------------------------------------------------
  // Read: Member statuses lookup
  // ---------------------------------------------------------------

  public async getMemberStatuses(): Promise<MemberStatusRow[]> {
    return this.mp!.getTableRecords<MemberStatusRow>({
      table: "Member_Statuses",
      select: "Member_Status_ID, Member_Status",
    });
  }

  // ---------------------------------------------------------------
  // Read: Membership milestones for a participant (Journey 7)
  // ---------------------------------------------------------------

  public async getMemberMilestones(participantId: number): Promise<MemberMilestone[]> {
    const safeId = sanitizeIds([participantId]);

    const rows = await this.mp!.getTableRecords<MilestoneRow>({
      table: "Participant_Milestones",
      select: "Participant_Milestone_ID, Participant_Milestones.[Milestone_ID], Milestone_ID_Table.[Milestone_Title], Date_Accomplished, Notes",
      filter: `Participant_ID IN (${safeId}) AND Milestone_ID_Table.[Journey_ID] = ${MEMBERSHIP_JOURNEY_ID}`,
      orderBy: "Date_Accomplished DESC",
    });

    return rows.map((r) => ({
      participantMilestoneId: r.Participant_Milestone_ID,
      milestoneId: r.Milestone_ID,
      milestoneName: r.Milestone_Title,
      dateAccomplished: r.Date_Accomplished,
      notes: r.Notes,
    }));
  }

  // ---------------------------------------------------------------
  // Read: Files attached to a milestone record
  // ---------------------------------------------------------------

  public async getMilestoneFiles(milestoneRecordId: number): Promise<BaseFileInfo[]> {
    // SECURITY: `milestoneRecordId` arrives from a "use server" action as a
    // type-erased React Flight argument — the `number` annotation is compile-time
    // only. Coerce it before it reaches the MP file path. (This feature is gated by
    // requireFeatureAccess("manage-members") rather than a per-record scope model,
    // so there is no per-record assert to add here.)
    const recordId = sanitizeId(milestoneRecordId);

    const fileBaseUrl = process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL;
    const files = await this.mp!.getFilesByRecord({
      table: "Participant_Milestones",
      recordId,
    });

    return files.map((f) => {
      const ext = (f.FileExtension || "").toLowerCase().replace(".", "");
      return {
        fileId: f.FileId,
        fileName: f.FileName,
        fileUrl: `${fileBaseUrl}/${f.UniqueFileId}`,
        isPdf: ext === "pdf",
        isImage: f.IsImage,
      };
    });
  }

  // ---------------------------------------------------------------
  // Write: Add milestone to Participant_Milestones
  // ---------------------------------------------------------------

  public async addMilestone(
    data: TransitionPayload,
    participantId: number,
    memberStatuses: MemberStatusRow[],
    userId?: number,
  ): Promise<number> {
    const milestoneId = STATUS_TO_MILESTONE[data.newStatusId];
    if (!milestoneId) {
      throw new Error(`No milestone mapping for status ID ${data.newStatusId}`);
    }

    // For Dropped transitions (5–9), auto-prefix notes with the status name
    let notes = data.notes ?? "";
    if (data.newStatusId >= 5 && data.newStatusId <= 9) {
      const statusName = memberStatuses.find(
        (s) => s.Member_Status_ID === data.newStatusId
      )?.Member_Status;
      if (statusName) {
        notes = notes.trim()
          ? `${statusName}: ${notes.trim()}`
          : statusName;
      }
    }

    const record: Record<string, unknown> = {
      Participant_ID: participantId,
      Milestone_ID: milestoneId,
      Program_ID: MEMBERSHIP_PROGRAM_ID,
      Date_Accomplished: data.milestoneDate
        ? `${data.milestoneDate}T${nowCentral().split("T")[1]}`
        : nowCentral(),
    };
    if (notes) {
      record.Notes = notes;
    }

    const created = await this.mp!.createTableRecords(
      "Participant_Milestones",
      [record],
      { $userId: userId },
    ) as unknown as { Participant_Milestone_ID: number }[];

    return created[0].Participant_Milestone_ID;
  }

  // ---------------------------------------------------------------
  // Write: Attach file to milestone
  // ---------------------------------------------------------------

  public async attachFileToMilestone(
    participantMilestoneId: number,
    file: File,
    userId?: number,
  ): Promise<void> {
    await this.mp!.uploadFiles({
      table: "Participant_Milestones",
      recordId: participantMilestoneId,
      files: [file],
      uploadParams: {
        description: "Membership milestone attachment",
        userId,
      },
    });
  }

  // ---------------------------------------------------------------
  // Write: Update participant member status
  // ---------------------------------------------------------------

  public async updateMemberStatus(
    participantId: number,
    newStatusId: number,
    userId?: number,
  ): Promise<void> {
    await this.mp!.updateTableRecords(
      "Participants",
      [{ Participant_ID: participantId, Member_Status_ID: newStatusId }],
      { $userId: userId },
    );
  }
}
