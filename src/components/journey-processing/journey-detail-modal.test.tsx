import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { JourneyCard } from "@/lib/dto";
import { hasUnsavedChanges, trackTypedInput } from "@/lib/unsaved-changes";

const { mockGetDetail, mockPause } = vi.hoisted(() => ({
  mockGetDetail: vi.fn(),
  mockPause: vi.fn(),
}));

vi.mock("./actions", () => ({
  getJourneyParticipantDetail: mockGetDetail,
  getJourneyMilestoneFiles: vi.fn().mockResolvedValue([]),
  createJourneyMilestone: vi.fn(),
  updateJourneyMilestone: vi.fn(),
  uploadJourneyParticipantPhoto: vi.fn(),
  completeJourneyParticipant: vi.fn(),
  pauseJourneyParticipant: mockPause,
  resumeJourneyParticipant: vi.fn(),
}));

import { JourneyDetailModal } from "./journey-detail-modal";

/**
 * SessionGuard (batch 6) keeps the page while a typed field is still on
 * screen with text in it. The pause reason lives in the pause confirm step,
 * so a FAILED pause must leave that step (and the reason) mounted: a pause
 * that failed because the session ended would otherwise unmount the only
 * copy of the reason, and the guard would leave the page as if nothing were
 * unsaved. A successful pause closes the step and the dialog. Cancel keeps
 * the text in state, and reopening the step brings it back in a new textarea
 * the tracker never saw, so the modal also declares an open step with a
 * reason in it (useUnsavedChanges), as the compliance twin does.
 */
describe("JourneyDetailModal pause reason (SessionGuard)", () => {
  const participant: JourneyCard = {
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
    isPaused: false,
    isFullyComplete: false,
    isDiscontinued: false,
    endDate: null,
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

  const renderModal = async (onOpenChange = vi.fn()) => {
    render(
      <JourneyDetailModal
        slug="baptism"
        participant={participant}
        open
        onOpenChange={onOpenChange}
        onUpdate={vi.fn()}
        isCurrentTab
        supportsPause
        journeyName="Baptism"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Pause Process" }));
    const reason = screen.getByLabelText(/reason for pausing/i) as HTMLTextAreaElement;
    // A browser delivers the new value, then a bubbling `input` event, which
    // is what the guard's capture listener records.
    fireEvent.input(reason, { target: { value: "Travelling until March" } });
    expect(hasUnsavedChanges()).toBe(true);
    return onOpenChange;
  };

  it("keeps the step and the typed reason on screen when the pause is refused", async () => {
    mockPause.mockResolvedValue({ success: false, error: "Pause failed" });
    await renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Pause" }));
    await screen.findByText("Pause failed");

    const reason = screen.getByLabelText(/reason for pausing/i) as HTMLTextAreaElement;
    expect(reason.value).toBe("Travelling until March");
    expect(screen.getByRole("button", { name: "Confirm Pause" })).toBeEnabled();
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("keeps the step and the typed reason on screen when the pause call throws (session ended)", async () => {
    mockPause.mockRejectedValue(new Error("Unauthorized"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Pause" }));
    await screen.findByText("Failed to pause participant");

    expect((screen.getByLabelText(/reason for pausing/i) as HTMLTextAreaElement).value).toBe(
      "Travelling until March",
    );
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("closes the step and the dialog after a successful pause", async () => {
    mockPause.mockResolvedValue({ success: true });
    const onOpenChange = await renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Confirm Pause" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    // `open` is still true here (the parent is a mock), so this checks the
    // step itself closed: the reason has left the page and holds nothing.
    await waitFor(() => expect(screen.queryByLabelText(/reason for pausing/i)).toBeNull());
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds the reason brought back by reopening the step after Cancel", async () => {
    mockPause.mockResolvedValue({ success: false, error: "Pause failed" });
    await renderModal();
    const typedInto = screen.getByLabelText(/reason for pausing/i);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(hasUnsavedChanges()).toBe(false);

    // "Pause Process" again: the step returns pre-filled from `pauseNotes`,
    // in a new textarea nobody typed into, so only the declaration sees it.
    fireEvent.click(screen.getByRole("button", { name: "Pause Process" }));
    const reopened = screen.getByLabelText(/reason for pausing/i) as HTMLTextAreaElement;
    expect(reopened).not.toBe(typedInto);
    expect(reopened.value).toBe("Travelling until March");
    expect(hasUnsavedChanges()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Confirm Pause" }));
    await screen.findByText("Pause failed");
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("holds nothing once the dialog closes (the component stays mounted while closed)", async () => {
    const props = {
      slug: "baptism",
      participant,
      onOpenChange: vi.fn(),
      onUpdate: vi.fn(),
      isCurrentTab: true,
      supportsPause: true,
      journeyName: "Baptism",
    };
    const { rerender } = render(<JourneyDetailModal {...props} open />);
    fireEvent.click(await screen.findByRole("button", { name: "Pause Process" }));
    fireEvent.input(screen.getByLabelText(/reason for pausing/i), { target: { value: "Away" } });
    expect(hasUnsavedChanges()).toBe(true);

    rerender(<JourneyDetailModal {...props} open={false} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds nothing once the user cancels the pause step", async () => {
    await renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText(/reason for pausing/i)).toBeNull();
    expect(hasUnsavedChanges()).toBe(false);
  });
});
