import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetTableRecords = vi.fn();

vi.mock('@/lib/providers/ministry-platform', () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
  },
}));

import { MemberService } from '@/services/memberService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MemberService.getMembershipMilestoneParticipant (N2)', () => {
  it('reads one row, limited to the membership journey', async () => {
    mockGetTableRecords.mockResolvedValue([{ Participant_ID: 100 }]);
    const service = await MemberService.getInstance();
    await expect(service.getMembershipMilestoneParticipant(9001)).resolves.toBe(100);
    expect(mockGetTableRecords).toHaveBeenCalledWith(expect.objectContaining({
      table: 'Participant_Milestones',
      filter: 'Participant_Milestones.[Participant_Milestone_ID] = 9001 AND Milestone_ID_Table.[Journey_ID] = 7',
      top: 1,
    }));
  });

  it('returns null when the row is missing or belongs to another journey', async () => {
    mockGetTableRecords.mockResolvedValue([]);
    const service = await MemberService.getInstance();
    await expect(service.getMembershipMilestoneParticipant(9001)).resolves.toBeNull();
  });

  it('refuses a non-integer record ID before any read', async () => {
    const service = await MemberService.getInstance();
    await expect(
      service.getMembershipMilestoneParticipant('1 OR 1=1' as unknown as number),
    ).rejects.toThrow(/Invalid ID/);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });
});
