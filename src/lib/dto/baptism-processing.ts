export interface BaptismApplicantInfo {
  Contact_ID: number;
  Participant_ID: number;
  Nickname: string | null;
  Last_Name: string;
  First_Name: string;
  Image_GUID: string | null;
  Group_Participant_ID: number;
  Start_Date: string;
  Email_Address: string | null;
  Mobile_Phone: string | null;
}

export interface BaptismChecklistItem {
  key: string;
  label: string;
  milestoneId: number;
  completed: boolean;
  date: string | null;
  status: 'complete' | 'not_started';
  notes: string | null;
  order: number;
}

export interface BaptismCard {
  info: BaptismApplicantInfo;
  checklist: BaptismChecklistItem[];
  completedCount: number;
  totalCount: number;
  isPaused: boolean;
  isFullyComplete: boolean;
}

export interface BaptismMilestoneDetail {
  Participant_Milestone_ID: number;
  Milestone_ID: number;
  Date_Accomplished: string | null;
  Notes: string | null;
}

export interface BaptismMilestoneFileInfo {
  fileId: number;
  fileName: string;
  fileUrl: string;
  isPdf: boolean;
  isImage: boolean;
}

export interface BaptismWriteBackConfig {
  programId: number | null;
  currentGroupId: number | null;
  pausedGroupId: number | null;
  defaultGroupRoleId: number | null;
  pauseMilestoneId: number | null;
  milestoneIds: Record<string, number | null>;
}

export interface BaptismDetail extends BaptismCard {
  milestones: BaptismMilestoneDetail[];
  writeBackConfig: BaptismWriteBackConfig;
}
