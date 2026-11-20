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
const { getUserAuthorization } = await import("./user");

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
