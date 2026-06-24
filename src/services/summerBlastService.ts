import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeIds, sanitizeId } from "@/lib/providers/ministry-platform/utils/filter-sanitize";
import { nowCentral, getAge } from "@/lib/processing-utils";
import {
  getSummerBlastConfig,
  getRequirementsForRole,
  getRoleLabel,
  type SummerBlastConfig,
  type SummerBlastRequirementConfig,
} from "@/lib/summer-blast-config";
import type {
  SummerBlastIntakeCard,
  SummerBlastVolunteerCard,
  SummerBlastChecklistItem,
  SummerBlastItemStatus,
  SummerBlastPersonInfo,
  BackgroundCheckDetail,
} from "@/lib/dto";

const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/** Group_Participants.Notes is capped at 500 chars. */
const NOTES_MAX = 500;

function formatSignupDate(dateStr: string): string {
  // Render YYYY-MM-DD from "YYYY-MM-DDTHH:MM:SS" without TZ conversion.
  // MP dates are naive Central; keeping only the date part avoids day-shift bugs.
  return dateStr.slice(0, 10);
}

/**
 * Build the Notes string we write onto Group_Participants when enrolling someone
 * from an intake Response. Exported for unit testing.
 */
export function buildEnrollmentNotes(
  response: { Response_Date: string; Comments: string | null } | null,
): string | null {
  if (!response) return null;
  const date = formatSignupDate(response.Response_Date);
  const head = `Signed up ${date}`;
  const comments = response.Comments?.trim();
  if (!comments) return head.slice(0, NOTES_MAX);
  const out = `${head} — ${comments}`;
  return out.length <= NOTES_MAX ? out : out.slice(0, NOTES_MAX - 1) + "…";
}

/**
 * Status for an item given an event-end cutoff (e.g. 2026-07-31).
 *
 * - `null` expires (never expires) → `complete`
 * - already past → `expired`
 * - expires before cutoff → `will_expire`
 * - expires on/after cutoff → `complete`
 *
 * Exported for unit testing.
 */
export function getEventExpirationStatus(
  expiresDateStr: string | null,
  cutoffDate: Date,
  now: Date = new Date(),
): "complete" | "expired" | "will_expire" {
  if (!expiresDateStr) return "complete";
  const expires = new Date(expiresDateStr);
  if (expires < now) return "expired";
  if (expires < cutoffDate) return "will_expire";
  return "complete";
}

// ---------------------------------------------------------------------------
// Raw record types
// ---------------------------------------------------------------------------

interface ResponseRecord {
  Response_ID: number;
  Response_Date: string;
  Opportunity_ID: number;
  Participant_ID: number;
  Closed: boolean;
  Comments: string | null;
}

interface GroupParticipantRecord {
  Group_Participant_ID: number;
  Participant_ID: number;
  Group_ID: number;
  Group_Role_ID: number;
  Start_Date: string;
  End_Date: string | null;
  Notes: string | null;
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
  Date_of_Birth: string | null;
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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SummerBlastService {
  private static instance: SummerBlastService | null = null;
  private mp: MPHelper;
  private config: SummerBlastConfig;

  private constructor(mp?: MPHelper) {
    this.mp = mp ?? new MPHelper();
    this.config = getSummerBlastConfig();
  }

  public static getInstance(): SummerBlastService {
    if (!this.instance) this.instance = new SummerBlastService();
    return this.instance;
  }

  /** Test-only constructor that accepts an injected MP helper. */
  public static _createForTest(mp: MPHelper): SummerBlastService {
    return new SummerBlastService(mp);
  }

  public getConfig(): SummerBlastConfig {
    return this.config;
  }

  private getCutoffDate(): Date {
    // eventEndDate is "YYYY-MM-DD" in Central time. Parse as local-noon so DST
    // shifts don't move it across the date boundary.
    const [y, m, d] = this.config.eventEndDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // -------------------------------------------------------------------------
  // Tab 1: Intake (Opportunity Responses)
  // -------------------------------------------------------------------------

  public async getIntakeCards(): Promise<SummerBlastIntakeCard[]> {
    const responses = await this.mp.getTableRecords<ResponseRecord>({
      table: "Responses",
      select: "Response_ID,Response_Date,Opportunity_ID,Participant_ID,Closed,Comments",
      filter: `Opportunity_ID = ${this.config.intakeOpportunityId} AND Closed = 0`,
      orderBy: "Response_Date DESC",
    });

    if (responses.length === 0) return [];

    // Deduplicate by Participant_ID — keep the most recent open response per person.
    const byParticipant = new Map<number, ResponseRecord>();
    for (const r of responses) {
      const existing = byParticipant.get(r.Participant_ID);
      if (!existing || new Date(r.Response_Date) > new Date(existing.Response_Date)) {
        byParticipant.set(r.Participant_ID, r);
      }
    }
    const dedupedResponses = [...byParticipant.values()];
    const participantIds = dedupedResponses.map((r) => r.Participant_ID);

    const contacts = await this.getContactsForParticipants(participantIds);

    const peopleByParticipant = new Map<number, SummerBlastPersonInfo>();
    for (const r of dedupedResponses) {
      const c = contacts.get(r.Participant_ID);
      if (!c) continue;
      peopleByParticipant.set(r.Participant_ID, {
        Contact_ID: c.Contact_ID,
        Participant_ID: r.Participant_ID,
        First_Name: c.First_Name,
        Nickname: c.Nickname,
        Last_Name: c.Last_Name,
        Image_GUID: c.Image_GUID,
        Group_Participant_ID: null,
        Start_Date: null,
        Email_Address: c.Email_Address,
        Mobile_Phone: c.Mobile_Phone,
      });
    }

    if (peopleByParticipant.size === 0) return [];

    const contactIds = [...peopleByParticipant.values()].map((p) => p.Contact_ID);
    const allParticipantIds = [...peopleByParticipant.keys()];

    // Compute ages and split adults from youths.
    const ageByParticipant = new Map<number, number | null>();
    const youthParticipantIds: number[] = [];
    for (const r of dedupedResponses) {
      const c = contacts.get(r.Participant_ID);
      if (!c) continue;
      const age = getAge(c.Date_of_Birth);
      ageByParticipant.set(r.Participant_ID, age);
      if (age !== null && age < 18) youthParticipantIds.push(r.Participant_ID);
    }

    const [bgChecks, certifications, formResponses, youthMembers] = await Promise.all([
      this.fetchBackgroundChecks(contactIds),
      this.fetchCertifications(allParticipantIds),
      this.fetchFormResponses(contactIds),
      this.fetchYouthGroupMembers(youthParticipantIds),
    ]);
    const bgTypeNames = await this.fetchBgCheckTypeNames(bgChecks);
    const cutoff = this.getCutoffDate();

    const cards: SummerBlastIntakeCard[] = [];
    for (const r of dedupedResponses) {
      const info = peopleByParticipant.get(r.Participant_ID);
      if (!info) continue;
      const age = ageByParticipant.get(r.Participant_ID) ?? null;
      const isYouth = age !== null && age < 18;

      const checklist = isYouth
        ? this.buildYouthChecklist(youthMembers.has(r.Participant_ID))
        : this.buildChecklist(
            info.Contact_ID,
            info.Participant_ID,
            this.config.intakeRequirements,
            bgChecks,
            certifications,
            formResponses,
            bgTypeNames,
            cutoff,
          );

      cards.push({
        info,
        checklist,
        completedCount: checklist.filter((c) => c.status === "complete").length,
        totalCount: checklist.length,
        isFullyCompliant: checklist.every((c) => c.status === "complete"),
        hasWillExpire: checklist.some((c) => c.status === "will_expire"),
        age,
        responseId: r.Response_ID,
        responseDate: r.Response_Date,
        comments: r.Comments,
      });
    }

    cards.sort((a, b) =>
      a.info.Last_Name.localeCompare(b.info.Last_Name) ||
      a.info.First_Name.localeCompare(b.info.First_Name),
    );
    return cards;
  }

  // -------------------------------------------------------------------------
  // Tab 2: Volunteers (Group_Participants in tracking group)
  // -------------------------------------------------------------------------

  public async getVolunteerCards(): Promise<SummerBlastVolunteerCard[]> {
    const now = nowCentral();
    const gps = await this.mp.getTableRecords<GroupParticipantRecord>({
      table: "Group_Participants",
      select:
        "Group_Participant_ID,Participant_ID,Group_ID,Group_Role_ID,Start_Date,End_Date,Notes",
      filter: `Group_ID = ${this.config.trackingGroupId} AND (End_Date IS NULL OR End_Date >= '${now}')`,
    });
    if (gps.length === 0) return [];

    // Deduplicate by Participant_ID — prefer record with null End_Date.
    const byParticipant = new Map<number, GroupParticipantRecord>();
    for (const gp of gps) {
      const existing = byParticipant.get(gp.Participant_ID);
      if (!existing || (gp.End_Date === null && existing.End_Date !== null)) {
        byParticipant.set(gp.Participant_ID, gp);
      }
    }
    const deduped = [...byParticipant.values()];
    const participantIds = deduped.map((g) => g.Participant_ID);

    const contacts = await this.getContactsForParticipants(participantIds);
    if (contacts.size === 0) return [];

    const contactIds = [...contacts.values()].map((c) => c.Contact_ID);

    // Compute ages and split adults from youths.
    const ageByParticipant = new Map<number, number | null>();
    const youthParticipantIds: number[] = [];
    for (const gp of deduped) {
      const c = contacts.get(gp.Participant_ID);
      if (!c) continue;
      const age = getAge(c.Date_of_Birth);
      ageByParticipant.set(gp.Participant_ID, age);
      if (age !== null && age < 18) youthParticipantIds.push(gp.Participant_ID);
    }

    const [bgChecks, certifications, formResponses, youthMembers] = await Promise.all([
      this.fetchBackgroundChecks(contactIds),
      this.fetchCertifications(participantIds),
      this.fetchFormResponses(contactIds),
      this.fetchYouthGroupMembers(youthParticipantIds),
    ]);
    const bgTypeNames = await this.fetchBgCheckTypeNames(bgChecks);
    const cutoff = this.getCutoffDate();

    const cards: SummerBlastVolunteerCard[] = [];
    for (const gp of deduped) {
      const c = contacts.get(gp.Participant_ID);
      if (!c) continue;

      const info: SummerBlastPersonInfo = {
        Contact_ID: c.Contact_ID,
        Participant_ID: gp.Participant_ID,
        First_Name: c.First_Name,
        Nickname: c.Nickname,
        Last_Name: c.Last_Name,
        Image_GUID: c.Image_GUID,
        Group_Participant_ID: gp.Group_Participant_ID,
        Start_Date: gp.Start_Date,
        Email_Address: c.Email_Address,
        Mobile_Phone: c.Mobile_Phone,
      };

      const age = ageByParticipant.get(gp.Participant_ID) ?? null;
      const isYouth = age !== null && age < 18;

      const checklist = isYouth
        ? this.buildYouthChecklist(youthMembers.has(gp.Participant_ID))
        : this.buildChecklist(
            info.Contact_ID,
            info.Participant_ID,
            getRequirementsForRole(this.config, gp.Group_Role_ID),
            bgChecks,
            certifications,
            formResponses,
            bgTypeNames,
            cutoff,
          );

      cards.push({
        info,
        checklist,
        completedCount: checklist.filter((i) => i.status === "complete").length,
        totalCount: checklist.length,
        isFullyCompliant: checklist.every((i) => i.status === "complete"),
        hasWillExpire: checklist.some((i) => i.status === "will_expire"),
        age,
        groupParticipantId: gp.Group_Participant_ID,
        groupRoleId: gp.Group_Role_ID,
        groupRoleLabel:
          getRoleLabel(this.config, gp.Group_Role_ID) ?? `Group Role ${gp.Group_Role_ID}`,
        startDate: gp.Start_Date,
        notes: gp.Notes,
      });
    }

    cards.sort((a, b) =>
      a.info.Last_Name.localeCompare(b.info.Last_Name) ||
      a.info.First_Name.localeCompare(b.info.First_Name),
    );
    return cards;
  }

  // -------------------------------------------------------------------------
  // Write actions
  // -------------------------------------------------------------------------

  /**
   * Add a person to the Summer Blast tracking group AND mark their intake Response Closed.
   * Both writes succeed or the second is attempted independently — we don't roll back the
   * first since MP doesn't expose transactions. Order: create the participant first, then
   * close the response, so a failure mid-way leaves a participant + an open response
   * (a re-try just re-runs both, and the de-duplicating client will hide the duplicate
   * once the participant exists for this person).
   */
  public async addToSummerBlast(params: {
    contactId: number;
    responseId: number;
    groupRoleId: number | null;
    userId?: number;
  }): Promise<{ groupParticipantId: number }> {
    const { groupRoleId, userId } = params;
    // SECURITY: coerce client-supplied IDs to positive integers before they reach
    // the Response_ID / Contact_ID filter interpolations below (filter-injection guard).
    const contactId = sanitizeId(params.contactId);
    const responseId = sanitizeId(params.responseId);

    // Fetch the response so we can carry its Comments + signup date into the
    // Group_Participants.Notes field. Done in parallel with the Participants lookup.
    const [responses, participants] = await Promise.all([
      this.mp.getTableRecords<ResponseRecord>({
        table: "Responses",
        select: "Response_ID,Response_Date,Opportunity_ID,Participant_ID,Closed,Comments",
        filter: `Response_ID = ${responseId}`,
        top: 1,
      }),
      this.mp.getTableRecords<ParticipantRecord>({
        table: "Participants",
        select: "Participant_ID,Contact_ID",
        filter: `Contact_ID = ${contactId}`,
        top: 1,
      }),
    ]);

    if (participants.length === 0) {
      throw new Error(`No Participant record for Contact_ID ${contactId}`);
    }
    const participantId = participants[0].Participant_ID;
    const response = responses[0] ?? null;

    const now = nowCentral();
    const roleId = groupRoleId ?? this.config.tempGroupRoleId;
    const notes = buildEnrollmentNotes(response);

    const created = (await this.mp.createTableRecords(
      "Group_Participants",
      [
        {
          Group_ID: this.config.trackingGroupId,
          Participant_ID: participantId,
          Group_Role_ID: roleId,
          Start_Date: now,
          ...(notes ? { Notes: notes } : {}),
        },
      ],
      { $userId: userId },
    )) as unknown as { Group_Participant_ID: number }[];

    const groupParticipantId = created[0].Group_Participant_ID;

    // Close the response so it disappears from the intake tab.
    await this.mp.updateTableRecords(
      "Responses",
      [{ Response_ID: responseId, Closed: true }],
      { $userId: userId },
    );

    return { groupParticipantId };
  }

  /** End-date a Group_Participants row (does not touch Responses). */
  public async removeFromSummerBlast(params: {
    groupParticipantId: number;
    userId?: number;
  }): Promise<void> {
    const { groupParticipantId, userId } = params;
    const now = nowCentral();
    await this.mp.updateTableRecords(
      "Group_Participants",
      [{ Group_Participant_ID: groupParticipantId, End_Date: now }],
      { $userId: userId },
    );
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Fetch the set of participant IDs that are active members of the youth group. */
  private async fetchYouthGroupMembers(
    youthParticipantIds: number[],
  ): Promise<Set<number>> {
    if (youthParticipantIds.length === 0) return new Set();
    const now = nowCentral();
    const all: { Participant_ID: number }[] = [];
    for (let i = 0; i < youthParticipantIds.length; i += BATCH_SIZE) {
      const batchIds = youthParticipantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<{ Participant_ID: number }>({
        table: "Group_Participants",
        select: "Participant_ID",
        filter: `Group_ID = ${this.config.youthGroupId} AND (End_Date IS NULL OR End_Date >= '${now}') AND Participant_ID IN (${sanitizeIds(batchIds)})`,
      });
      all.push(...batch);
    }
    return new Set(all.map((r) => r.Participant_ID));
  }

  /** Single-item checklist for an under-18 volunteer: are they in Group 964? */
  private buildYouthChecklist(isMember: boolean): SummerBlastChecklistItem[] {
    return [
      {
        key: `youth-${this.config.youthGroupId}`,
        label: this.config.youthRequirementLabel,
        type: "group_membership",
        completed: isMember,
        date: null,
        expires: null,
        status: isMember ? "complete" : "not_started",
        detail: null,
        order: 1,
        recordId: null,
        bgCheckDetail: null,
      },
    ];
  }

  private buildChecklist(
    contactId: number,
    participantId: number,
    requirements: SummerBlastRequirementConfig[],
    bgChecks: BackgroundCheckRecord[],
    certifications: CertificationRecord[],
    formResponses: FormResponseRecord[],
    bgTypeNames: Map<number, string>,
    cutoff: Date,
  ): SummerBlastChecklistItem[] {
    const items: SummerBlastChecklistItem[] = [];

    const now = new Date();

    for (const req of [...requirements].sort((a, b) => a.sortOrder - b.sortOrder)) {
      switch (req.type) {
        case "background_check": {
          // All BG checks for this contact, ordered newest-first by the fetch.
          const all = bgChecks.filter((bc) => bc.Contact_ID === contactId);

          // A BG check with Expires set was completed/approved by MP at some
          // point. Trust that as the canonical "previously valid" signal —
          // All_Clear may not always be set on older records.
          const activeValid = all.find(
            (bc) => bc.Background_Check_Expires && new Date(bc.Background_Check_Expires) >= now,
          );
          const expiredCompleted = all.find(
            (bc) => bc.Background_Check_Expires && new Date(bc.Background_Check_Expires) < now,
          );
          const pendingNewer = all.find((bc) => !bc.Background_Check_Expires);

          let status: SummerBlastItemStatus;
          let previouslyExpired = false;
          let displayRecord: BackgroundCheckRecord | null = null;

          if (activeValid) {
            status = getEventExpirationStatus(activeValid.Background_Check_Expires, cutoff);
            displayRecord = activeValid;
          } else if (pendingNewer) {
            status = "in_progress";
            previouslyExpired = !!expiredCompleted;
            displayRecord = pendingNewer;
          } else if (expiredCompleted) {
            status = "expired";
            displayRecord = expiredCompleted;
          } else {
            status = "not_started";
          }

          let bgDetail: BackgroundCheckDetail | null = null;
          if (displayRecord) {
            let bgStatus = "Pending";
            if (displayRecord.All_Clear === true && displayRecord.Background_Check_Returned) bgStatus = "Completed";
            else if (displayRecord.Background_Check_Returned) bgStatus = "Returned";
            else if (displayRecord.Background_Check_Submitted) bgStatus = "Submitted";
            else bgStatus = "Started";
            bgDetail = {
              typeName: displayRecord.Background_Check_Type_ID
                ? bgTypeNames.get(displayRecord.Background_Check_Type_ID) ?? null
                : null,
              status: bgStatus,
              started: displayRecord.Background_Check_Started,
              submitted: displayRecord.Background_Check_Submitted,
              returned: displayRecord.Background_Check_Returned,
              allClear: displayRecord.All_Clear,
              expires: displayRecord.Background_Check_Expires,
              reportUrl: displayRecord.Report_Url,
            };
          }

          items.push({
            key: `req-${req.requirementId}-bg`,
            label: req.label,
            type: "background_check",
            completed: status === "complete",
            date:
              displayRecord?.Background_Check_Returned ??
              displayRecord?.Background_Check_Started ??
              null,
            expires: displayRecord?.Background_Check_Expires ?? null,
            status,
            detail: displayRecord ? (displayRecord.All_Clear ? "All Clear" : "Pending") : null,
            order: req.sortOrder,
            recordId: displayRecord?.Background_Check_ID ?? null,
            bgCheckDetail: bgDetail,
            previouslyExpired,
          });
          break;
        }
        case "certification": {
          const matching = certifications.filter(
            (c) =>
              c.Participant_ID === participantId &&
              c.Certification_Type_ID === req.requirementId,
          );

          // A passed cert with an Expires date is the canonical "completed"
          // signal; missing Certification_Expires means no expiry tracked.
          const activeValid = matching.find(
            (c) =>
              c.Certification_Completed &&
              c.Passed !== false &&
              (!c.Certification_Expires || new Date(c.Certification_Expires) >= now),
          );
          const expiredCompleted = matching.find(
            (c) =>
              c.Certification_Completed &&
              c.Passed !== false &&
              c.Certification_Expires &&
              new Date(c.Certification_Expires) < now,
          );
          const pendingOrFailed = matching.find(
            (c) => !c.Certification_Completed || c.Passed === false,
          );

          let status: SummerBlastItemStatus;
          let previouslyExpired = false;
          let displayRecord: CertificationRecord | null = null;

          if (activeValid) {
            status = getEventExpirationStatus(activeValid.Certification_Expires, cutoff);
            displayRecord = activeValid;
          } else if (pendingOrFailed) {
            status = "in_progress";
            previouslyExpired = !!expiredCompleted;
            displayRecord = pendingOrFailed;
          } else if (expiredCompleted) {
            status = "expired";
            displayRecord = expiredCompleted;
          } else {
            status = "not_started";
          }

          items.push({
            key: `req-${req.requirementId}-cert`,
            label: req.label,
            type: "certification",
            completed: status === "complete",
            date: displayRecord?.Certification_Completed ?? null,
            expires: displayRecord?.Certification_Expires ?? null,
            status,
            detail: displayRecord?.Passed === false ? "Failed" : null,
            order: req.sortOrder,
            recordId: displayRecord?.Participant_Certification_ID ?? null,
            bgCheckDetail: null,
            previouslyExpired,
          });
          break;
        }
        case "form": {
          const matching = formResponses.filter(
            (f) => f.Contact_ID === contactId && f.Form_ID === req.requirementId,
          );

          const activeValid = matching.find(
            (f) => !f.Expires || new Date(f.Expires) >= now,
          );
          const expiredResponse = matching.find(
            (f) => f.Expires && new Date(f.Expires) < now,
          );

          let status: SummerBlastItemStatus;
          let displayRecord: FormResponseRecord | null = null;

          if (activeValid) {
            status = getEventExpirationStatus(activeValid.Expires, cutoff);
            displayRecord = activeValid;
          } else if (expiredResponse) {
            status = "expired";
            displayRecord = expiredResponse;
          } else {
            status = "not_started";
          }

          items.push({
            key: `req-${req.requirementId}-form`,
            label: req.label,
            type: "form",
            completed: status === "complete",
            date: displayRecord?.Response_Date ?? null,
            expires: displayRecord?.Expires ?? null,
            status,
            detail: null,
            order: req.sortOrder,
            recordId: displayRecord?.Form_Response_ID ?? null,
            bgCheckDetail: null,
          });
          break;
        }
      }
    }
    return items.sort((a, b) => a.order - b.order);
  }

  private async getContactsForParticipants(
    participantIds: number[],
  ): Promise<Map<number, ContactRecord & { Participant_ID: number }>> {
    if (participantIds.length === 0) return new Map();

    const allParticipants: ParticipantRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<ParticipantRecord>({
        table: "Participants",
        select: "Participant_ID,Contact_ID",
        filter: `Participant_ID IN (${sanitizeIds(batchIds)})`,
      });
      allParticipants.push(...batch);
    }

    const contactIds = [...new Set(allParticipants.map((p) => p.Contact_ID))];
    if (contactIds.length === 0) return new Map();

    const allContacts: ContactRecord[] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batchIds = contactIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<ContactRecord>({
        table: "Contacts",
        select:
          "Contact_ID,First_Name,Nickname,Last_Name,dp_fileUniqueId AS Image_GUID,Email_Address,Mobile_Phone,Date_of_Birth",
        filter: `Contact_ID IN (${sanitizeIds(batchIds)})`,
      });
      allContacts.push(...batch);
    }

    const contactMap = new Map(allContacts.map((c) => [c.Contact_ID, c]));
    const result = new Map<number, ContactRecord & { Participant_ID: number }>();
    for (const p of allParticipants) {
      const c = contactMap.get(p.Contact_ID);
      if (c) result.set(p.Participant_ID, { ...c, Participant_ID: p.Participant_ID });
    }
    return result;
  }

  private async fetchBackgroundChecks(contactIds: number[]): Promise<BackgroundCheckRecord[]> {
    if (contactIds.length === 0) return [];
    const all: BackgroundCheckRecord[] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batchIds = contactIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<BackgroundCheckRecord>({
        table: "Background_Checks",
        select:
          "Background_Check_ID,Contact_ID,Background_Check_Status_ID,Background_Check_Started,Background_Check_Submitted,Background_Check_Returned,All_Clear,Background_Check_Expires,Report_Url,Background_Check_Type_ID",
        filter: `Contact_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: "Background_Check_Started DESC",
      });
      all.push(...batch);
    }
    return all;
  }

  private async fetchBgCheckTypeNames(
    bgChecks: BackgroundCheckRecord[],
  ): Promise<Map<number, string>> {
    const typeIds = [
      ...new Set(
        bgChecks
          .map((b) => b.Background_Check_Type_ID)
          .filter((id): id is number => id !== null),
      ),
    ];
    if (typeIds.length === 0) return new Map();
    const types = await this.mp.getTableRecords<{
      Background_Check_Type_ID: number;
      Background_Check_Type: string;
    }>({
      table: "Background_Check_Types",
      select: "Background_Check_Type_ID,Background_Check_Type",
      filter: `Background_Check_Type_ID IN (${sanitizeIds(typeIds)})`,
    });
    return new Map(types.map((t) => [t.Background_Check_Type_ID, t.Background_Check_Type]));
  }

  private async fetchCertifications(
    participantIds: number[],
  ): Promise<CertificationRecord[]> {
    if (participantIds.length === 0) return [];
    const all: CertificationRecord[] = [];
    for (let i = 0; i < participantIds.length; i += BATCH_SIZE) {
      const batchIds = participantIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<CertificationRecord>({
        table: "Participant_Certifications",
        select:
          "Participant_Certification_ID,Participant_ID,Certification_Type_ID,Certification_Completed,Certification_Expires,Passed",
        filter: `Participant_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: "Certification_Completed DESC",
      });
      all.push(...batch);
    }
    return all;
  }

  private async fetchFormResponses(
    contactIds: number[],
  ): Promise<FormResponseRecord[]> {
    if (contactIds.length === 0) return [];
    const all: FormResponseRecord[] = [];
    for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
      const batchIds = contactIds.slice(i, i + BATCH_SIZE);
      const batch = await this.mp.getTableRecords<FormResponseRecord>({
        table: "Form_Responses",
        select: "Form_Response_ID,Form_ID,Contact_ID,Response_Date,Expires",
        filter: `Contact_ID IN (${sanitizeIds(batchIds)})`,
        orderBy: "Response_Date DESC",
      });
      all.push(...batch);
    }
    return all;
  }
}
