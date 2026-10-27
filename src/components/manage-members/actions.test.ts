import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockRequireFeatureAccess,
  mockGetCachedAllContacts,
  mockGetMembershipMilestoneParticipant,
  mockGetMilestoneFiles,
  mockGetMemberStatuses,
  mockAddMilestone,
  mockUpdateMemberStatus,
  mockContactUploadPhoto,
  mockUploadContactPhoto,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockGetCachedAllContacts: vi.fn(),
  mockGetMembershipMilestoneParticipant: vi.fn(),
  mockGetMilestoneFiles: vi.fn(),
  mockGetMemberStatuses: vi.fn(),
  mockAddMilestone: vi.fn(),
  mockUpdateMemberStatus: vi.fn(),
  mockContactUploadPhoto: vi.fn(),
  mockUploadContactPhoto: vi.fn(),
}));

vi.mock('next/cache', () => ({ updateTag: vi.fn() }));
vi.mock('@/lib/authorization', () => ({ requireFeatureAccess: mockRequireFeatureAccess }));
vi.mock('@/lib/auth-helpers', () => ({ getMpUserId: () => 7 }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn() }));
vi.mock('@/components/contact-lookup/cached-contacts', () => ({
  getCachedAllContacts: mockGetCachedAllContacts,
}));
vi.mock('@/services/memberService', () => ({
  MemberService: {
    getInstance: vi.fn().mockResolvedValue({
      getMembershipMilestoneParticipant: mockGetMembershipMilestoneParticipant,
      getMilestoneFiles: mockGetMilestoneFiles,
      getMemberStatuses: mockGetMemberStatuses,
      addMilestone: mockAddMilestone,
      updateMemberStatus: mockUpdateMemberStatus,
      attachFileToMilestone: vi.fn(),
    }),
  },
}));
vi.mock('@/services/contactService', () => ({
  ContactService: { getInstance: vi.fn().mockResolvedValue({ uploadContactPhoto: mockContactUploadPhoto }) },
}));
// The shared upload's own validation is tested with it; here it just runs the
// feature's service factory, which is where manage-members binds the contact.
vi.mock('@/components/shared-actions/processing', () => ({
  uploadContactPhoto: mockUploadContactPhoto,
}));

import { fetchMilestoneFiles, transitionMember, uploadMemberPhoto } from './actions';

const contact = (Contact_ID: number, Participant_ID: number | null, Member_Status_ID: number | null) => ({
  Contact_ID, Participant_ID, Member_Status_ID, Member_Status: Member_Status_ID ? 'Member' : null,
  First_Name: 'A', Last_Name: 'B', Nickname: null, Email_Address: null, Mobile_Phone: null,
  Image_GUID: null, Date_Joined: null,
});

const transitionForm = (contactId: string, participantId: string) => {
  const fd = new FormData();
  fd.set('contactId', contactId);
  fd.set('participantId', participantId);
  fd.set('newStatusId', '2');
  fd.set('milestoneDate', '2026-10-27');
  return fd;
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireFeatureAccess.mockResolvedValue({ user: { id: 'u1' } });
  // Members: contacts 10 and 30. Contact 20 has a participant but no member status.
  mockGetCachedAllContacts.mockResolvedValue([contact(10, 100, 1), contact(20, 200, null), contact(30, 300, 2)]);
  mockGetMilestoneFiles.mockResolvedValue([{ fileId: 1 }]);
  mockGetMemberStatuses.mockResolvedValue([]);
  mockAddMilestone.mockResolvedValue(555);
  mockUploadContactPhoto.mockImplementation(async (fd: FormData, getService: () => Promise<{
    uploadContactPhoto: (contactId: number, file: File, userId: number | undefined) => Promise<void>;
  }>) => {
    const service = await getService();
    await service.uploadContactPhoto(Number(fd.get('Contact_ID')), new File(['x'], 'p.png'), 7);
    return { success: true };
  });
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warn.mockRestore());

describe('fetchMilestoneFiles (N2)', () => {
  it("lists a member's membership milestone files", async () => {
    mockGetMembershipMilestoneParticipant.mockResolvedValue(100);
    await expect(fetchMilestoneFiles(9001)).resolves.toEqual([{ fileId: 1 }]);
    expect(mockGetMilestoneFiles).toHaveBeenCalledWith(9001);
  });

  it('refuses a milestone that is not a membership milestone (another tool’s row)', async () => {
    mockGetMembershipMilestoneParticipant.mockResolvedValue(null);
    await expect(fetchMilestoneFiles(9001)).rejects.toThrow(/Forbidden/);
    expect(mockGetMilestoneFiles).not.toHaveBeenCalled();
  });

  it("refuses a membership milestone of someone outside the member set", async () => {
    mockGetMembershipMilestoneParticipant.mockResolvedValue(200);
    await expect(fetchMilestoneFiles(9001)).rejects.toThrow(/Forbidden/);
    expect(mockGetMilestoneFiles).not.toHaveBeenCalled();
  });

  it('refuses a non-integer record ID before any read', async () => {
    await expect(fetchMilestoneFiles('1 OR 1=1' as unknown as number)).rejects.toThrow(/Invalid ID/);
    expect(mockGetMembershipMilestoneParticipant).not.toHaveBeenCalled();
  });
});

describe('transitionMember (N7)', () => {
  it("transitions a member card's own contact and participant", async () => {
    await expect(transitionMember(transitionForm('10', '100'))).resolves.toEqual({ success: true });
    expect(mockUpdateMemberStatus).toHaveBeenCalledWith(100, 2, 7);
  });

  it.each([
    ['a participant outside the member set', '20', '200'],
    ["another member's contact with this participant", '30', '100'],
    ['a participant that does not exist', '10', '999'],
  ])('refuses %s, with no write', async (_case, contactId, participantId) => {
    const result = await transitionMember(transitionForm(contactId, participantId));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Forbidden/);
    expect(mockAddMilestone).not.toHaveBeenCalled();
    expect(mockUpdateMemberStatus).not.toHaveBeenCalled();
  });
});

describe('uploadMemberPhoto (N3)', () => {
  const photoForm = (contactId: string) => {
    const fd = new FormData();
    fd.set('Contact_ID', contactId);
    return fd;
  };

  it("uploads a member's photo", async () => {
    await uploadMemberPhoto(photoForm('30'));
    expect(mockContactUploadPhoto).toHaveBeenCalledWith(30, expect.any(File), 7);
  });

  it("refuses a contact outside the member set, before the upload", async () => {
    await expect(uploadMemberPhoto(photoForm('20'))).rejects.toThrow(/Forbidden/);
    expect(mockContactUploadPhoto).not.toHaveBeenCalled();
  });
});
