import { TransitionPayload, STATUS_TO_MILESTONE } from "@/lib/dto";
import { MPHelper } from "@/lib/providers/ministry-platform";

/** Member status lookup row. */
interface MemberStatusRow {
  Member_Status_ID: number;
  Member_Status: string;
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
      Date_Accomplished: data.milestoneDate || new Date().toISOString().split("T")[0],
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
