import { BasePersonInfo, BaseCardData, BaseFileInfo, BaseMilestoneDetail } from './processing-shared';

export interface ComplianceParticipantInfo extends BasePersonInfo {
  Email_Address: string | null;
  Mobile_Phone: string | null;
}

export interface ComplianceChecklistItem {
  key: string;
  label: string;
  type: 'background_check' | 'certification' | 'milestone' | 'form' | 'journey_milestone';
  completed: boolean;
  date: string | null;
  expires: string | null;
  status: 'complete' | 'in_progress' | 'expired' | 'expiring_soon' | 'not_started';
  detail: string | null;
  order: number;
}

export interface ComplianceCard extends BaseCardData<ComplianceParticipantInfo, ComplianceChecklistItem> {
  isFullyCompliant: boolean;
  isPaused: boolean;
  endDate: string | null;
  groupRoleNames: string[];
}

export type ComplianceMilestoneDetail = BaseMilestoneDetail;

export type ComplianceMilestoneFileInfo = BaseFileInfo;

export interface ComplianceWriteBackConfig {
  programId: number | null;
  trackingGroupId: number | null;
  pausedGroupId: number | null;
  defaultGroupRoleId: number | null;
  pauseMilestoneId: number | null;
  supportsPause: boolean;
  /** Map of milestone key → milestone ID for journey milestones */
  milestoneIds: Record<string, number | null>;
}

export interface ComplianceDetail extends ComplianceCard {
  milestones: ComplianceMilestoneDetail[];
  writeBackConfig: ComplianceWriteBackConfig;
}
