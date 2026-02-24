import { BasePersonInfo, BaseCardData, BaseFileInfo, BaseMilestoneDetail } from './processing-shared';

export interface BaptismApplicantInfo extends BasePersonInfo {
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

export interface BaptismCard extends BaseCardData<BaptismApplicantInfo, BaptismChecklistItem> {
  isPaused: boolean;
  isFullyComplete: boolean;
  /** Non-null when the participant's only group record has a future End_Date (no active record without an End_Date). */
  endDate: string | null;
}

export type BaptismMilestoneDetail = BaseMilestoneDetail;

export type BaptismMilestoneFileInfo = BaseFileInfo;

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
