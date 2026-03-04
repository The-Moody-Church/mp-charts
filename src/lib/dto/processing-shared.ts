/** Fields shared by all person info types (volunteer, baptism, membership). */
export interface BasePersonInfo {
  Contact_ID: number;
  Participant_ID: number;
  Nickname: string | null;
  Last_Name: string;
  First_Name: string;
  Image_GUID: string | null;
  Group_Participant_ID: number | null;
  Start_Date: string | null;
}

/** Fields shared by all card data types. */
export interface BaseCardData<TInfo extends BasePersonInfo = BasePersonInfo, TChecklist = unknown> {
  info: TInfo;
  checklist: TChecklist[];
  completedCount: number;
  totalCount: number;
}

/** File info shape shared by all milestone file types. */
export interface BaseFileInfo {
  fileId: number;
  fileName: string;
  fileUrl: string;
  isPdf: boolean;
  isImage: boolean;
}

/** Milestone detail shape shared by baptism and membership. */
export interface BaseMilestoneDetail {
  Participant_Milestone_ID: number;
  Milestone_ID: number;
  Date_Accomplished: string | null;
  Notes: string | null;
}
