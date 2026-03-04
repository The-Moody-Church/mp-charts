import { BasePersonInfo, BaseCardData, BaseFileInfo, BaseMilestoneDetail } from './processing-shared';

export interface ComplianceParticipantInfo extends BasePersonInfo {
  Email_Address: string | null;
  Mobile_Phone: string | null;
}

export interface BackgroundCheckDetail {
  typeName: string | null;
  status: string | null;
  started: string | null;
  submitted: string | null;
  returned: string | null;
  allClear: boolean | null;
  expires: string | null;
  reportUrl: string | null;
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
  /** Record ID for linking to the MP record (e.g., Background_Check_ID, Participant_Certification_ID) */
  recordId: number | null;
  /** Structured detail for background check items */
  bgCheckDetail: BackgroundCheckDetail | null;
}

export interface ComplianceCard extends BaseCardData<ComplianceParticipantInfo, ComplianceChecklistItem> {
  isFullyCompliant: boolean;
  isDiscontinued: boolean;
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
  /** Map of certification key → Certification_Type_ID for certification requirements */
  certificationTypeIds: Record<string, number | null>;
  /** Map of form key → Form_ID for form response requirements */
  formIds: Record<string, number | null>;
}

export interface ComplianceDetail extends ComplianceCard {
  milestones: ComplianceMilestoneDetail[];
  writeBackConfig: ComplianceWriteBackConfig;
}
