import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { JourneyCard } from "@/lib/dto";
import type { JourneyToolConfig } from "@/lib/journey-tools-config-types";

const { mockGetParticipants, mockGetCompleted, mockGetPaused, mockGetDetail, mockUploadPhoto } =
  vi.hoisted(() => ({
    mockGetParticipants: vi.fn(),
    mockGetCompleted: vi.fn(),
    mockGetPaused: vi.fn(),
    mockGetDetail: vi.fn(),
    mockUploadPhoto: vi.fn(),
  }));

vi.mock("./actions", () => ({
  getJourneyParticipants: mockGetParticipants,
  getCompletedJourneyParticipants: mockGetCompleted,
  getPausedJourneyParticipants: mockGetPaused,
  getJourneyParticipantDetail: mockGetDetail,
  getJourneyMilestoneFiles: vi.fn().mockResolvedValue([]),
  createJourneyMilestone: vi.fn(),
  updateJourneyMilestone: vi.fn(),
  uploadJourneyParticipantPhoto: mockUploadPhoto,
  completeJourneyParticipant: vi.fn(),
  pauseJourneyParticipant: vi.fn(),
  resumeJourneyParticipant: vi.fn(),
}));

import { JourneyProcessing } from "./journey-processing";

/**
 * Twin of compliance-processing.test.tsx. Same two regressions — a lost deep-link
 * latch and a lost per-open refetch — plus the dimension compliance doesn't have:
 * milestone mode, where there is no tracking group, the tabs are
 * In Progress / Completed, and the deep link matches on Participant_ID instead of
 * Group_Participant_ID.
 */
describe("JourneyProcessing", () => {
  const card = (id: number, firstName: string, groupParticipantId: number | null = id): JourneyCard => ({
    info: {
      Contact_ID: id + 100,
      Participant_ID: id + 200,
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
    isPaused: false,
    isFullyComplete: false,
    isDiscontinued: false,
    endDate: null,
  });

  const baseConfig: JourneyToolConfig = {
    slug: "baptism",
    journeyId: 7,
    journeyName: "Baptism",
    description: "",
    enabled: true,
    milestones: [],
    programId: 9,
    trackingGroupId: 42,
    pausedGroupId: 43,
    defaultGroupRoleId: 2,
    supportsPause: true,
    pauseMilestoneId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  // No tracking group => milestone mode: In Progress / Completed tabs.
  const milestoneConfig: JourneyToolConfig = {
    ...baseConfig,
    trackingGroupId: null,
    supportsPause: false,
    pausedGroupId: null,
  };

  const renderScreen = async (config: JourneyToolConfig, initialApplicantId?: number) => {
    render(
      <JourneyProcessing slug="baptism" config={config} initialApplicantId={initialApplicantId} />
    );
    await screen.findByRole("heading", { name: "Baptism" });
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
    mockGetCompleted.mockImplementation(async () => [card(3, "Cleo")]);
    mockGetPaused.mockImplementation(async () => [card(4, "Pat")]);
    mockGetDetail.mockResolvedValue(null);
    mockUploadPhoto.mockResolvedValue({ success: true });
  });

  it("refetches the detail when the SAME participant is reopened", async () => {
    await renderScreen(baseConfig);

    fireEvent.click(await screen.findByText("Alice Tester"));
    await waitFor(() => expect(mockGetDetail).toHaveBeenCalledTimes(1));

    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Alice Tester"));

    await waitFor(() => expect(mockGetDetail).toHaveBeenCalledTimes(2));
  });

  it("deep-links to a paused participant on the Paused tab (group mode)", async () => {
    await renderScreen(baseConfig, 4);

    await screen.findByRole("dialog");
    expect(screen.getByRole("tab", { name: /paused/i, hidden: true })).toHaveProperty(
      "dataset.state",
      "active"
    );
    // Group mode matches on Group_Participant_ID.
    expect(mockGetDetail).toHaveBeenCalledWith("baptism", 104, 204, 4);
  });

  it("deep-links on Participant_ID and the Completed tab in milestone mode", async () => {
    // Milestone mode has no Group_Participant_ID to match on.
    mockGetParticipants.mockImplementation(async () => [card(1, "Alice", null)]);
    mockGetCompleted.mockImplementation(async () => [card(3, "Cleo", null)]);

    await renderScreen(milestoneConfig, 203);

    await screen.findByRole("dialog");
    expect(screen.getByRole("tab", { name: /completed/i, hidden: true })).toHaveProperty(
      "dataset.state",
      "active"
    );
    expect(mockGetDetail).toHaveBeenCalledWith("baptism", 103, 203, null);
    expect(mockGetPaused).not.toHaveBeenCalled();
  });

  it("does not re-apply the deep link when a later save refreshes the list", async () => {
    await renderScreen(baseConfig, 1);

    await screen.findByRole("dialog");
    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Bob Tester"));
    await within(await screen.findByRole("dialog")).findByText(/Bob Tester/);

    // onUpdate() reloads the lists with new array identities. Without a one-shot
    // latch the deep link re-matches and yanks the open modal back to Alice.
    await uploadPhoto();

    await waitFor(() => expect(mockGetParticipants).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog").textContent).toContain("Bob Tester");
    expect(screen.getByRole("dialog").textContent).not.toContain("Alice Tester");
  });

  it("does not query the paused list when pause is not configured", async () => {
    await renderScreen(milestoneConfig);

    await screen.findByText("Alice Tester");
    expect(mockGetPaused).not.toHaveBeenCalled();
    expect(mockGetCompleted).toHaveBeenCalledWith("baptism");
  });

  it("surfaces a load failure as an in-page error", async () => {
    mockGetParticipants.mockRejectedValue(new Error("MP down"));

    await renderScreen(baseConfig);

    expect(await screen.findByText(/failed to load participants/i)).toBeDefined();
  });
});
