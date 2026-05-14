import { BasePersonInfo } from "./processing-shared";
import { BackgroundCheckDetail } from "./compliance-processing";

export interface SummerBlastPersonInfo extends BasePersonInfo {
  Email_Address: string | null;
  Mobile_Phone: string | null;
}

export type SummerBlastItemStatus =
  | "complete"
  | "will_expire"
  | "expired"
  | "in_progress"
  | "not_started";

export interface SummerBlastChecklistItem {
  key: string;
  label: string;
  type: "background_check" | "certification" | "form";
  /** True when the requirement is satisfied AND won't expire before eventEndDate. */
  completed: boolean;
  /** Submission/completion date. */
  date: string | null;
  /** Expiration date, if any. */
  expires: string | null;
  status: SummerBlastItemStatus;
  /** Free-text detail (e.g. "Failed" for cert). */
  detail: string | null;
  order: number;
  /** Underlying MP record id for linking. */
  recordId: number | null;
  /** Structured detail for background check items. */
  bgCheckDetail: BackgroundCheckDetail | null;
}

interface SummerBlastBaseCard {
  info: SummerBlastPersonInfo;
  checklist: SummerBlastChecklistItem[];
  completedCount: number;
  totalCount: number;
  /** All items satisfied AND none expire before event end. */
  isFullyCompliant: boolean;
  /** Any item is currently valid but will expire before event end. */
  hasWillExpire: boolean;
}

export interface SummerBlastIntakeCard extends SummerBlastBaseCard {
  /** Underlying Responses record ID — needed when marking the response Closed. */
  responseId: number;
  /** Date the person signed up (Responses.Response_Date). */
  responseDate: string;
  /** Free-text comments the person left when signing up (Responses.Comments). */
  comments: string | null;
}

export interface SummerBlastVolunteerCard extends SummerBlastBaseCard {
  groupParticipantId: number;
  groupRoleId: number;
  groupRoleLabel: string;
  startDate: string;
  /** Notes on the Group_Participant — populated from the intake Response when enrolled. */
  notes: string | null;
}
