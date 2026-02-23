export interface MembershipApplicantInfo {
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

export interface MembershipChecklistItem {
  key: string;
  label: string;
  milestoneId: number;
  completed: boolean;
  date: string | null;
  status: 'complete' | 'not_started';
  notes: string | null;
  order: number;
}

export interface MembershipCard {
  info: MembershipApplicantInfo;
  checklist: MembershipChecklistItem[];
  completedCount: number;
  totalCount: number;
  isFullyComplete: boolean;
}

export interface MembershipMilestoneDetail {
  Participant_Milestone_ID: number;
  Milestone_ID: number;
  Date_Accomplished: string | null;
  Notes: string | null;
}

export interface MembershipMilestoneFileInfo {
  fileId: number;
  fileName: string;
  fileUrl: string;
  isPdf: boolean;
  isImage: boolean;
}

export interface MembershipWriteBackConfig {
  programId: number | null;
  groupId: number | null;
  registeredMemberMilestoneId: number | null;
  milestoneIds: Record<string, number | null>;
}

export interface MembershipDetail extends MembershipCard {
  milestones: MembershipMilestoneDetail[];
  writeBackConfig: MembershipWriteBackConfig;
}
