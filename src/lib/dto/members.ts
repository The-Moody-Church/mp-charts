/**
 * DTOs for the Manage Members feature.
 * Only participants with a non-null Member_Status_ID are included.
 */

export interface MemberCard {
  contactId: number;
  participantId: number;
  displayName: string;
  nickname: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  mobilePhone: string | null;
  memberStatusId: number;
  memberStatus: string;
  contactStatusId: number | null;
  fileUniqueId: string | null;
  dateJoined: string | null;
}

export interface MemberMilestone {
  participantMilestoneId: number;
  milestoneId: number;
  milestoneName: string;
  dateAccomplished: string | null;
  notes: string | null;
}

export interface MemberDetail {
  member: MemberCard;
  milestones: MemberMilestone[];
}

export interface MemberStatusGroup {
  key: string;
  label: string;
  statusIds: number[];
  count: number;
}

export interface TransitionPayload {
  contactId: number;
  participantId: number;
  newStatusId: number;
  milestoneDate: string;
  notes?: string;
}

/** Tab groups in display order */
export const MEMBER_STATUS_GROUPS: Omit<MemberStatusGroup, 'count'>[] = [
  { key: 'registered', label: 'Registered', statusIds: [1] },
  { key: 'associate', label: 'Associate', statusIds: [4] },
  { key: 'youth', label: 'Youth', statusIds: [10] },
  { key: 'dropped', label: 'Dropped', statusIds: [5, 6, 7, 8, 9] },
];

/** Membership Journey ID in Ministry Platform */
export const MEMBERSHIP_JOURNEY_ID = 7;

/** Maps Member_Status_ID → Milestone_ID for the membership journey */
export const STATUS_TO_MILESTONE: Record<number, number> = {
  1: 48,   // Registered Member
  4: 51,   // Associate Membership
  10: 52,  // Youth Membership
  5: 49, 6: 49, 7: 49, 8: 49, 9: 49, // All Dropped → Dropped Membership
};

/** Page size for member pagination */
export const MEMBERS_PAGE_SIZE = 50;
