import { BasePersonInfo, BaseCardData, BaseFileInfo, BaseMilestoneDetail } from './processing-shared';

export interface JourneyParticipantInfo extends BasePersonInfo {
  Email_Address: string | null;
  Mobile_Phone: string | null;
}

export interface JourneyChecklistItem {
  key: string;
  label: string;
  milestoneId: number;
  completed: boolean;
  date: string | null;
  status: 'complete' | 'not_started';
  notes: string | null;
  order: number;
}

export interface JourneyCard extends BaseCardData<JourneyParticipantInfo, JourneyChecklistItem> {
  isPaused: boolean;
  isFullyComplete: boolean;
  isDiscontinued: boolean;
  endDate: string | null;
}

export type JourneyMilestoneDetail = BaseMilestoneDetail;

export type JourneyMilestoneFileInfo = BaseFileInfo;

export interface JourneyWriteBackConfig {
  programId: number;
  trackingGroupId: number | null;
  pausedGroupId: number | null;
  defaultGroupRoleId: number | null;
  pauseMilestoneId: number | null;
  supportsPause: boolean;
  milestoneIds: Record<string, number | null>;
}

export interface JourneyDetail extends JourneyCard {
  milestones: JourneyMilestoneDetail[];
  writeBackConfig: JourneyWriteBackConfig;
}
