import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ComplianceCard } from "@/lib/dto";
import { hasUnsavedChanges, trackTypedInput } from "@/lib/unsaved-changes";

const { mockGetDetail, mockPause } = vi.hoisted(() => ({
  mockGetDetail: vi.fn(),
  mockPause: vi.fn(),
}));

vi.mock("./actions", () => ({
  getComplianceParticipantDetail: mockGetDetail,
  getComplianceMilestoneFiles: vi.fn().mockResolvedValue([]),
  getComplianceRequirementFiles: vi.fn().mockResolvedValue([]),
  createComplianceMilestone: vi.fn(),
  createComplianceCertification: vi.fn(),
  createComplianceFormResponse: vi.fn(),
  updateComplianceMilestone: vi.fn(),
  uploadComplianceParticipantPhoto: vi.fn(),
  completeComplianceParticipant: vi.fn(),
  pauseComplianceParticipant: mockPause,
  resumeComplianceParticipant: vi.fn(),
}));

import { ComplianceDetailModal } from "./compliance-detail-modal";

/**
 * SessionGuard (batch 6) and the pause reason. Unlike the journey twin, this
 * modal hides the pause controls while "Remove from Tracking Group" is being
 * confirmed (`showPauseControls = supportsPause && !showCompleteConfirm`), so
 * the reason textarea leaves the page with its text still unsaved in state.
 * The modal declares it with useUnsavedChanges while the pause step is open,
 * and, like the journey modal, keeps the step open after a failed pause.
 */
describe("ComplianceDetailModal pause reason (SessionGuard)", () => {
  const participant: ComplianceCard = {
    info: {
      Contact_ID: 101,
      Participant_ID: 201,
      Nickname: null,
      Last_Name: "Tester",
      First_Name: "Alice",
      Image_GUID: null,
      Group_Participant_ID: 301,
      Start_Date: "2026-01-01",
      Email_Address: null,
      Mobile_Phone: null,
    },
    checklist: [],
    completedCount: 0,
    totalCount: 0,
    isFullyCompliant: false,
    isDiscontinued: false,
    isPaused: false,
    endDate: null,
    groupRoleNames: [],
  };

  let stopTracking: () => void;
  beforeEach(() => {
    mockGetDetail.mockResolvedValue(null);
    stopTracking = trackTypedInput();
  });
  afterEach(() => {
    stopTracking();
    vi.restoreAllMocks();
  });

  const modal = (open: boolean, onOpenChange = vi.fn()) => (
    <ComplianceDetailModal
      slug="volunteer-compliance"
      participant={participant}
      open={open}
      onOpenChange={onOpenChange}
      onUpdate={vi.fn()}
      isCurrentTab
      supportsPause
      toolName="Volunteer Compliance"
    />
  );

  const reasonField = () => screen.queryByLabelText(/reason for pausing/i) as HTMLTextAreaElement | null;

  const openPauseAndType = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Pause Process" }));
    fireEvent.input(reasonField()!, { target: { value: "Travelling until March" } });
    expect(hasUnsavedChanges()).toBe(true);
  };

  it("holds the page while confirming removal hides the typed reason", async () => {
    render(modal(true));
    await openPauseAndType();

    fireEvent.click(screen.getByRole("button", { name: "Remove from Tracking Group" }));
    expect(reasonField()).toBeNull();
    // The textarea is gone; only the modal's declaration can say so.
    expect(hasUnsavedChanges()).toBe(true);

    // Cancelling the removal brings the step and the text back.
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    expect(reasonField()!.value).toBe("Travelling until March");
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("holds nothing once the pause step is cancelled", async () => {
    render(modal(true));
    await openPauseAndType();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(reasonField()).toBeNull();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds nothing for a blank reason", async () => {
    render(modal(true));
    fireEvent.click(await screen.findByRole("button", { name: "Pause Process" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from Tracking Group" }));
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds nothing once the dialog closes (the component stays mounted while closed)", async () => {
    const { rerender } = render(modal(true));
    await openPauseAndType();
    fireEvent.click(screen.getByRole("button", { name: "Remove from Tracking Group" }));
    expect(hasUnsavedChanges()).toBe(true);

    rerender(modal(false));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("keeps the step and the typed reason on screen when the pause fails", async () => {
    mockPause.mockRejectedValue(new Error("Unauthorized"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(modal(true));
    await openPauseAndType();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Pause" }));
    await screen.findByText("Failed to pause participant");

    expect(reasonField()!.value).toBe("Travelling until March");
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("closes the step and holds nothing after a successful pause", async () => {
    mockPause.mockResolvedValue({ success: true });
    const onOpenChange = vi.fn();
    render(modal(true, onOpenChange));
    await openPauseAndType();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Pause" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    await waitFor(() => expect(reasonField()).toBeNull());
    expect(hasUnsavedChanges()).toBe(false);
  });
});
