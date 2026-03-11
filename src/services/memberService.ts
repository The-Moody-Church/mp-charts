import { MemberCard, TransitionPayload, STATUS_TO_MILESTONE, MEMBERS_PAGE_SIZE } from "@/lib/dto";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeFilterValue, sanitizeIds } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

/** Raw row shape returned by the primary members query. */
interface MemberRow {
  Contact_ID: number;
  Display_Name: string;
  Nickname: string | null;
  First_Name: string;
  Last_Name: string;
  Email_Address: string | null;
  Mobile_Phone: string | null;
  Contact_Status_ID: number | null;
  dp_fileUniqueId: string | null;
  Participant_ID: number;
  Member_Status_ID: number;
  Member_Status: string;
}

/** Raw row shape for the lightweight status-count query. */
interface StatusCountRow {
  Contact_ID: number;
  Member_Status_ID: number;
}

/** Member status lookup row. */
interface MemberStatusRow {
  Member_Status_ID: number;
  Member_Status: string;
}

function toMemberCard(row: MemberRow): MemberCard {
  return {
    contactId: row.Contact_ID,
    participantId: row.Participant_ID,
    displayName: row.Display_Name,
    nickname: row.Nickname,
    firstName: row.First_Name,
    lastName: row.Last_Name,
    email: row.Email_Address,
    mobilePhone: row.Mobile_Phone,
    memberStatusId: row.Member_Status_ID,
    memberStatus: row.Member_Status,
    contactStatusId: row.Contact_Status_ID,
    fileUniqueId: row.dp_fileUniqueId,
  };
}

/**
 * Build the filter clause for member queries.
 * Always requires a Participant record with a non-null Member_Status_ID.
 * Optionally adds status and search filters.
 */
function buildMemberFilter(options: {
  statusIds?: number[];
  search?: string;
}): string {
  const parts: string[] = [
    "Participant_Record IS NOT NULL",
    "Participant_Record_Table.[Member_Status_ID] IS NOT NULL",
  ];

  if (options.statusIds && options.statusIds.length > 0) {
    parts.push(
      `Participant_Record_Table.[Member_Status_ID] IN (${sanitizeIds(options.statusIds)})`
    );
  }

  if (options.search && options.search.trim()) {
    const safe = sanitizeFilterValue(options.search.trim());
    parts.push(
      `(Display_Name LIKE '%${safe}%' OR Email_Address LIKE '%${safe}%' OR Mobile_Phone LIKE '%${safe}%')`
    );
  }

  return parts.join(" AND ");
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
  // Read: Paginated members
  // ---------------------------------------------------------------

  public async getMembers(options: {
    statusIds?: number[];
    top?: number;
    skip?: number;
    search?: string;
  }): Promise<{ members: MemberCard[]; total: number }> {
    const filter = buildMemberFilter({
      statusIds: options.statusIds,
      search: options.search,
    });
    const top = options.top ?? MEMBERS_PAGE_SIZE;

    const select = [
      "Contacts.[Contact_ID]", "Display_Name", "Nickname", "First_Name", "Last_Name",
      "Email_Address", "Mobile_Phone", "Contact_Status_ID", "dp_fileUniqueId",
      "Participant_Record_Table.[Participant_ID]",
      "Participant_Record_Table.[Member_Status_ID]",
      "Participant_Record_Table_Member_Status_ID_Table.[Member_Status]",
    ].join(", ");

    // Fetch one extra record to determine if there are more pages
    const rows = await this.mp!.getTableRecords<MemberRow>({
      table: "Contacts",
      select,
      filter,
      orderBy: "Last_Name, First_Name",
      top: top + 1,
      skip: options.skip ?? 0,
    });

    // If we got more than `top` records, there are more pages
    const hasMore = rows.length > top;
    const pageRows = hasMore ? rows.slice(0, top) : rows;

    // For total count, use the separate getStatusCounts method
    // Here we just provide an indicator for "has more"
    // The shell will use getStatusCounts for accurate totals
    return {
      members: pageRows.map(toMemberCard),
      total: -1, // Caller should use getStatusCounts for totals
    };
  }

  // ---------------------------------------------------------------
  // Read: Status counts (lightweight, for tabs)
  // ---------------------------------------------------------------

  public async getStatusCounts(search?: string): Promise<Record<string, number>> {
    const filter = buildMemberFilter({ search });

    // Fetch just Contact_ID + Member_Status_ID (two columns, lightweight)
    const rows = await this.mp!.getTableRecords<StatusCountRow>({
      table: "Contacts",
      select: "Contacts.[Contact_ID], Participant_Record_Table.[Member_Status_ID]",
      filter,
    });

    // Count client-side
    const counts: Record<string, number> = {};
    for (const row of rows) {
      const key = String(row.Member_Status_ID);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
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
