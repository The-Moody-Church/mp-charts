import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-helpers", () => ({
  requireSession: vi.fn(),
  getUserGuid: vi.fn(),
}));
vi.mock("@/services/userService", () => ({
  UserService: { getInstance: vi.fn() },
}));
vi.mock("@/lib/authorization", () => ({
  getAccessibleFeatures: vi.fn(),
  isSuperAdmin: vi.fn(),
}));
vi.mock("@/lib/journey-tools-config", () => ({
  getEnabledJourneyTools: vi.fn(),
}));
vi.mock("@/lib/compliance-tools-config", () => ({
  getEnabledComplianceTools: vi.fn(),
}));

const { requireSession, getUserGuid } = await import("@/lib/auth-helpers");
const { UserService } = await import("@/services/userService");
const { getAccessibleFeatures, isSuperAdmin } = await import("@/lib/authorization");
const { getEnabledJourneyTools } = await import("@/lib/journey-tools-config");
const { getEnabledComplianceTools } = await import("@/lib/compliance-tools-config");
const { getUserAuthorization, getCurrentUserProfile } = await import("./user");

const journeys = [
  { slug: "baptism", journeyName: "Baptism", description: "b", programId: 1, trackingGroupId: 2 },
  { slug: "membership", journeyName: "Membership", description: "m", programId: 3, trackingGroupId: 4 },
];
const compliance = [
  { slug: "child-safety", toolName: "Child Safety", description: "c", journeyId: 5 },
  { slug: "ushers", toolName: "Ushers", description: "u", journeyId: 6 },
];

describe("getUserAuthorization", () => {
  beforeEach(() => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(getUserGuid).mockReturnValue("abc-123");
    vi.mocked(UserService.getInstance).mockResolvedValue({
      getUserProfile: vi.fn().mockResolvedValue({ userGroupIds: [45] }),
    } as never);
    vi.mocked(isSuperAdmin).mockReturnValue(false);
    vi.mocked(getEnabledJourneyTools).mockReturnValue(journeys as never);
    vi.mocked(getEnabledComplianceTools).mockReturnValue(compliance as never);
  });

  it("sends only the tools the user may open, as slug/name/description", async () => {
    vi.mocked(getAccessibleFeatures).mockReturnValue(["dashboard", "journey:membership", "compliance:ushers"]);

    const result = await getUserAuthorization();

    expect(result).toEqual({
      accessibleFeatures: ["dashboard", "journey:membership", "compliance:ushers"],
      isSuperAdmin: false,
      journeyTools: [{ slug: "membership", name: "Membership", description: "m" }],
      complianceTools: [{ slug: "ushers", name: "Ushers", description: "u" }],
    });
    expect(getAccessibleFeatures).toHaveBeenCalledExactlyOnceWith([45]);
  });

  it("sends no tools to a user with no tool access", async () => {
    vi.mocked(getAccessibleFeatures).mockReturnValue(["dashboard"]);

    const result = await getUserAuthorization();

    expect(result.journeyTools).toEqual([]);
    expect(result.complianceTools).toEqual([]);
  });

  it("does not match a journey key against a compliance tool of the same slug", async () => {
    vi.mocked(getEnabledComplianceTools).mockReturnValue([{ ...compliance[0], slug: "baptism" }] as never);
    vi.mocked(getAccessibleFeatures).mockReturnValue(["journey:baptism"]);

    const result = await getUserAuthorization();

    expect(result.journeyTools.map((t) => t.slug)).toEqual(["baptism"]);
    expect(result.complianceTools).toEqual([]);
  });

  it("sends every enabled tool to a super-admin", async () => {
    vi.mocked(isSuperAdmin).mockReturnValue(true);
    vi.mocked(getAccessibleFeatures).mockReturnValue([
      "journey:baptism", "journey:membership", "compliance:child-safety", "compliance:ushers",
    ]);

    const result = await getUserAuthorization();

    expect(result.isSuperAdmin).toBe(true);
    expect(result.journeyTools.map((t) => t.slug)).toEqual(["baptism", "membership"]);
    expect(result.complianceTools.map((t) => t.slug)).toEqual(["child-safety", "ushers"]);
  });

  it("reads the GUID from the session requireSession resolved", async () => {
    const session = { user: { id: "u-auth" } };
    vi.mocked(requireSession).mockResolvedValue(session as never);
    vi.mocked(getAccessibleFeatures).mockReturnValue([]);

    await getUserAuthorization();

    expect(getUserGuid).toHaveBeenCalledExactlyOnceWith(session);
  });

  it("rejects, touching nothing, when requireSession rejects", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Unauthorized"));

    await expect(getUserAuthorization()).rejects.toThrow("Unauthorized");

    expect(getUserGuid).not.toHaveBeenCalled();
    expect(UserService.getInstance).not.toHaveBeenCalled();
  });

  it("returns nothing when the session has no user GUID or no profile", async () => {
    const empty = { accessibleFeatures: [], isSuperAdmin: false, journeyTools: [], complianceTools: [] };
    vi.mocked(getUserGuid).mockReturnValue(undefined);
    await expect(getUserAuthorization()).resolves.toEqual(empty);

    vi.mocked(getUserGuid).mockReturnValue("abc-123");
    vi.mocked(UserService.getInstance).mockResolvedValue({
      getUserProfile: vi.fn().mockResolvedValue(undefined),
    } as never);
    await expect(getUserAuthorization()).resolves.toEqual(empty);
  });
});

describe("getCurrentUserProfile (CurrentUserProfile DTO, upstream 0670531)", () => {
  // The full server-side profile, with every field the browser must NOT get.
  const serverProfile = {
    User_ID: 7,
    User_GUID: "ab12cd34-ef56-7890-abcd-ef1234567890",
    Contact_ID: 42,
    First_Name: "Samuel",
    Nickname: "Sam",
    Last_Name: "Ortiz",
    Email_Address: "sam@example.com",
    Mobile_Phone: "555-0100",
    Image_GUID: "11111111-2222-3333-4444-555555555555",
    userGroups: ["Staff"],
    userGroupIds: [45],
    // Not on MPUserProfile any more, but a stale cache entry or a future
    // select could carry it; the DTO must drop it regardless.
    roles: ["Administrators"],
  };

  beforeEach(() => {
    vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(getUserGuid).mockReturnValue("ab12cd34-ef56-7890-abcd-ef1234567890");
    vi.mocked(UserService.getInstance).mockResolvedValue({
      getUserProfile: vi.fn().mockResolvedValue(serverProfile),
    } as never);
  });

  it("returns exactly the five fields the shell renders", async () => {
    const result = await getCurrentUserProfile();

    expect(Object.keys(result ?? {}).sort()).toEqual(
      ["Email_Address", "First_Name", "Image_GUID", "Last_Name", "Nickname"]
    );
    expect(result).toEqual({
      First_Name: "Samuel",
      Nickname: "Sam",
      Last_Name: "Ortiz",
      Email_Address: "sam@example.com",
      Image_GUID: "11111111-2222-3333-4444-555555555555",
    });
  });

  it.each(["Mobile_Phone", "User_ID", "User_GUID", "Contact_ID", "userGroupIds", "userGroups", "roles"])(
    "never sends %s to the browser",
    async (key) => {
      const result = await getCurrentUserProfile();
      expect(result).not.toHaveProperty(key);
    }
  );

  it("normalises missing optional fields to null rather than omitting them", async () => {
    vi.mocked(UserService.getInstance).mockResolvedValue({
      getUserProfile: vi.fn().mockResolvedValue({ First_Name: "Ann", Last_Name: "Lee", userGroupIds: [] }),
    } as never);

    await expect(getCurrentUserProfile()).resolves.toEqual({
      First_Name: "Ann",
      Nickname: null,
      Last_Name: "Lee",
      Email_Address: null,
      Image_GUID: null,
    });
  });

  it("ignores a client-supplied GUID and reads the session's own (F4)", async () => {
    const getUserProfile = vi.fn().mockResolvedValue(serverProfile);
    vi.mocked(UserService.getInstance).mockResolvedValue({ getUserProfile } as never);

    await getCurrentUserProfile("99999999-9999-9999-9999-999999999999");

    expect(getUserProfile).toHaveBeenCalledExactlyOnceWith("ab12cd34-ef56-7890-abcd-ef1234567890");
  });

  it("reads the GUID from the session requireSession resolved", async () => {
    const session = { user: { id: "u-profile" } };
    vi.mocked(requireSession).mockResolvedValue(session as never);

    await getCurrentUserProfile();

    expect(getUserGuid).toHaveBeenCalledExactlyOnceWith(session);
  });

  it("rejects, touching nothing, when requireSession rejects", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("Unauthorized"));

    await expect(getCurrentUserProfile()).rejects.toThrow("Unauthorized");

    expect(getUserGuid).not.toHaveBeenCalled();
    expect(UserService.getInstance).not.toHaveBeenCalled();
  });

  it("returns undefined with no session GUID or no dp_Users row", async () => {
    vi.mocked(getUserGuid).mockReturnValue(undefined);
    await expect(getCurrentUserProfile()).resolves.toBeUndefined();

    vi.mocked(getUserGuid).mockReturnValue("ab12cd34-ef56-7890-abcd-ef1234567890");
    vi.mocked(UserService.getInstance).mockResolvedValue({
      getUserProfile: vi.fn().mockResolvedValue(undefined),
    } as never);
    await expect(getCurrentUserProfile()).resolves.toBeUndefined();
  });
});
