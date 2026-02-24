import { BasePersonInfo, BaseCardData, BaseFileInfo, BaseMilestoneDetail } from './processing-shared';

export interface MembershipApplicantInfo extends BasePersonInfo {
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

export interface MembershipCard extends BaseCardData<MembershipApplicantInfo, MembershipChecklistItem> {
  isFullyComplete: boolean;
}

export type MembershipMilestoneDetail = BaseMilestoneDetail;

export type MembershipMilestoneFileInfo = BaseFileInfo;

export interface MembershipWriteBackConfig {
  programId: number | null;
  groupId: number | null;
  milestoneIds: Record<string, number | null>;
}

export interface MembershipDetail extends MembershipCard {
  milestones: MembershipMilestoneDetail[];
  writeBackConfig: MembershipWriteBackConfig;
}
