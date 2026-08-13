import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { ComplianceCard } from "@/lib/dto";
import type { ComplianceToolConfig } from "@/lib/compliance-tools-config-types";

const { mockGetParticipants, mockGetPaused, mockGetDetail, mockUploadPhoto } = vi.hoisted(() => ({
  mockGetParticipants: vi.fn(),
  mockGetPaused: vi.fn(),
  mockGetDetail: vi.fn(),
  mockUploadPhoto: vi.fn(),
}));

vi.mock("./actions", () => ({
  getComplianceParticipants: mockGetParticipants,
  getPausedComplianceParticipants: mockGetPaused,
  getComplianceParticipantDetail: mockGetDetail,
  getComplianceMilestoneFiles: vi.fn().mockResolvedValue([]),
  getComplianceRequirementFiles: vi.fn().mockResolvedValue([]),
  createComplianceMilestone: vi.fn(),
  createComplianceCertification: vi.fn(),
  createComplianceFormResponse: vi.fn(),
  updateComplianceMilestone: vi.fn(),
  uploadComplianceParticipantPhoto: mockUploadPhoto,
  completeComplianceParticipant: vi.fn(),
  pauseComplianceParticipant: vi.fn(),
  resumeComplianceParticipant: vi.fn(),
}));

import { ComplianceProcessing } from "./compliance-processing";

/**
 * Guards the deep-link auto-open latch and the per-open detail refetch.
 *
 * Written against the `hasAutoOpened` state latch and the `[open, participant]`
 * reset-and-fetch effect, and must keep passing once those become a ref latch in
 * the load continuation and a remount driven by a per-open counter.
 *
 * Two regressions these exist to catch, both silent:
 *  - losing the latch, so the modal springs back open after every save
 *  - keying the remount on the participant id, so closing and reopening the SAME
 *    volunteer stops refetching. Staff edit milestones directly in MP and expect
 *    the modal to show current data.
 */
describe("ComplianceProcessing", () => {
  const card = (groupParticipantId: number, firstName: string, isPaused = false): ComplianceCard => ({
    info: {
      Contact_ID: groupParticipantId + 100,
      Participant_ID: groupParticipantId + 200,
      Nickname: null,
      Last_Name: "Tester",
      First_Name: firstName,
      Image_GUID: null,
      Group_Participant_ID: groupParticipantId,
      Start_Date: "2026-01-01",
      Email_Address: null,
      Mobile_Phone: null,
    },
    checklist: [],
    completedCount: 0,
    totalCount: 0,
    isFullyCompliant: false,
    isDiscontinued: false,
    isPaused,
    endDate: null,
    groupRoleNames: [],
  });

  const config: ComplianceToolConfig = {
    slug: "volunteer-compliance",
    toolName: "Volunteer Compliance",
    description: "",
    enabled: true,
    groupRoleIds: [5],
    journeyId: null,
    journeyMilestones: [],
    requirements: [],
    programId: null,
    trackingGroupId: 42,
    defaultGroupRoleId: 2,
    supportsPause: true,
    pausedGroupId: 43,
    pauseMilestoneId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const renderScreen = async (initialApplicantId?: number) => {
    render(
      <ComplianceProcessing slug="volunteer-compliance" config={config} initialApplicantId={initialApplicantId} />
    );
    await screen.findByRole("tab", { name: /current/i });
  };

  const closeDialog = () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

  /** Cheapest reachable path to onUpdate() with a null detail fixture. */
  const uploadPhoto = async () => {
    const input = screen
      .getByRole("dialog")
      .querySelector('input[type="file"][accept^="image"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "photo.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled());
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // mockImplementation, NOT mockResolvedValue: the latter resolves the SAME
    // array instance every call, so React bails out of the re-render and a list
    // refresh becomes unobservable — which silently defanged the latch test.
    mockGetParticipants.mockImplementation(async () => [card(1, "Alice"), card(2, "Bob")]);
    mockGetPaused.mockImplementation(async () => [card(3, "Pat", true)]);
    mockGetDetail.mockResolvedValue(null);
    mockUploadPhoto.mockResolvedValue({ success: true });
  });

  it("refetches the detail when the SAME participant is reopened", async () => {
    await renderScreen();

    fireEvent.click(await screen.findByText("Alice Tester"));
    await waitFor(() => expect(mockGetDetail).toHaveBeenCalledTimes(1));

    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Same card. A participant-id key would not remount here, and the refetch
    // would silently stop — the modal would show stale MP data.
    fireEvent.click(screen.getByText("Alice Tester"));

    await waitFor(() => expect(mockGetDetail).toHaveBeenCalledTimes(2));
  });

  it("refetches the detail when a DIFFERENT participant is opened", async () => {
    await renderScreen();

    fireEvent.click(await screen.findByText("Alice Tester"));
    await waitFor(() => expect(mockGetDetail).toHaveBeenCalledTimes(1));

    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Bob Tester"));

    await waitFor(() => expect(mockGetDetail).toHaveBeenCalledTimes(2));
    expect(mockGetDetail).toHaveBeenLastCalledWith("volunteer-compliance", 102, 202, 2);
  });

  it("deep-links to a paused participant on the Paused tab", async () => {
    await renderScreen(3);

    await screen.findByRole("dialog");
    // The tab has to switch BEFORE the modal paints: `isCurrentTab` drives the
    // action set, and offering Pause instead of Resume is a wrong-write risk.
    // `hidden: true` because an open Radix dialog aria-hides the rest of the page.
    expect(screen.getByRole("tab", { name: /paused/i, hidden: true })).toHaveProperty(
      "dataset.state",
      "active"
    );
    expect(mockGetDetail).toHaveBeenCalledWith("volunteer-compliance", 103, 203, 3);
  });

  it("does not re-apply the deep link when a later save refreshes the list", async () => {
    await renderScreen(1);

    // Deep link opened Alice. Close it and open Bob instead.
    await screen.findByRole("dialog");
    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Bob Tester"));
    await within(await screen.findByRole("dialog")).findByText(/Bob Tester/);

    // A save inside the modal calls onUpdate(), which reloads both lists with new
    // array identities. Without a one-shot latch the deep-link match fires again
    // and yanks the open modal from Bob back to Alice.
    await uploadPhoto();

    await waitFor(() => expect(mockGetParticipants).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog").textContent).toContain("Bob Tester");
    expect(screen.getByRole("dialog").textContent).not.toContain("Alice Tester");
  });

  it("surfaces a load failure as an in-page error, not a thrown boundary", async () => {
    mockGetParticipants.mockRejectedValue(new Error("MP down"));

    await renderScreen();

    expect(await screen.findByText(/failed to load participants/i)).toBeDefined();
  });
});
