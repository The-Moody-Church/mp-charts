import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { JourneyToolConfig } from "@/lib/journey-tools-config-types";
import { hasUnsavedChanges, trackTypedInput } from "@/lib/unsaved-changes";

const { mockGetJourneyMilestones, mockSaveJourneyToolAction } = vi.hoisted(() => ({
  mockGetJourneyMilestones: vi.fn(),
  mockSaveJourneyToolAction: vi.fn(),
}));

vi.mock("./actions", () => ({
  getAvailableJourneys: vi.fn().mockResolvedValue([
    { Journey_ID: 10, Journey_Name: "Baptism", Description: null, Active: true },
  ]),
  getJourneyMilestones: mockGetJourneyMilestones,
  getAvailablePrograms: vi.fn().mockResolvedValue([]),
  getAvailableGroups: vi.fn().mockResolvedValue([]),
  getAvailableGroupRoles: vi.fn().mockResolvedValue([]),
  getProgramsByIds: vi.fn().mockResolvedValue([]),
  getGroupsByIds: vi.fn().mockResolvedValue([]),
  saveJourneyToolAction: mockSaveJourneyToolAction,
}));

import { JourneyToolEditor } from "./journey-tool-editor";

/**
 * SessionGuard (batch 6) and the journey tool editor. "Refresh from MP" swaps
 * the MilestonePicker for a loading line and back, so a typed label returns in
 * a new input the typed-field tracker never saw. The editor therefore declares
 * useUnsavedChanges while its form differs from what it loaded: false for an
 * untouched editor (also across Refresh), true after any edit (also across
 * Refresh), and over once the admin page unmounts it (Cancel, successful save).
 */
describe("JourneyToolEditor unsaved changes (SessionGuard)", () => {
  const savedTool: JourneyToolConfig = {
    slug: "baptism",
    journeyId: 10,
    journeyName: "Baptism Processing",
    description: "",
    enabled: true,
    milestones: [
      { milestoneId: 100, label: "Renamed by admin", sortOrder: 1, visible: true },
      { milestoneId: 101, label: "Interview", sortOrder: 2, visible: true },
    ],
    programId: 7,
    trackingGroupId: null,
    pausedGroupId: null,
    defaultGroupRoleId: null,
    supportsPause: false,
    pauseMilestoneId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  // MP has a milestone the saved config lacks: the mount-time reconcile adds
  // it, and that reconciled list (not the saved one) is the editor's baseline.
  const mpMilestones = [
    { Milestone_ID: 100, Milestone_Title: "Baptism Class", Sort_Order: 1, Discontinued: false },
    { Milestone_ID: 101, Milestone_Title: "Interview", Sort_Order: 2, Discontinued: false },
    { Milestone_ID: 102, Milestone_Title: "Baptized", Sort_Order: 3, Discontinued: false },
  ];

  let stopTracking: () => void;
  beforeEach(() => {
    mockGetJourneyMilestones.mockResolvedValue(mpMilestones);
    mockSaveJourneyToolAction.mockResolvedValue({ success: true });
    stopTracking = trackTypedInput();
  });
  afterEach(() => {
    stopTracking();
    vi.restoreAllMocks();
  });

  /** The admin page's own shape: the editor is shown until saved or cancelled. */
  function AdminHarness() {
    const [show, setShow] = useState(true);
    return show ? (
      <JourneyToolEditor
        existingTool={savedTool}
        existingSlugs={["baptism"]}
        usedJourneyIds={[]}
        onSaved={() => setShow(false)}
        onCancel={() => setShow(false)}
      />
    ) : (
      <p>Editor closed</p>
    );
  }

  const renderEditor = async () => {
    render(<AdminHarness />);
    return (await screen.findByDisplayValue("Renamed by admin")) as HTMLInputElement;
  };

  const refresh = async () => {
    fireEvent.click(screen.getByRole("button", { name: /refresh from mp/i }));
    await screen.findByText("Loading milestones...");
    await waitFor(() => expect(screen.queryByText("Loading milestones...")).toBeNull());
  };

  it("holds nothing for an untouched editor, also after Refresh from MP", async () => {
    await renderEditor();
    expect(screen.getByDisplayValue("Baptized")).toBeDefined();
    expect(hasUnsavedChanges()).toBe(false);

    await refresh();
    expect(mockGetJourneyMilestones).toHaveBeenCalledTimes(2);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("keeps holding a typed milestone label after Refresh from MP remounts its input", async () => {
    const typedInto = await renderEditor();
    fireEvent.input(typedInto, { target: { value: "Baptism Class (spring)" } });
    expect(hasUnsavedChanges()).toBe(true);

    await refresh();
    const remounted = screen.getByDisplayValue("Baptism Class (spring)");
    expect(remounted).not.toBe(typedInto);
    expect(typedInto.isConnected).toBe(false);
    // The tracker only knew the old input; the editor's declaration holds it.
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("holds a checkbox edit, and stops when it is undone", async () => {
    await renderEditor();
    const enabled = screen.getByRole("checkbox", { name: "Tool Enabled" });

    fireEvent.click(enabled);
    expect(hasUnsavedChanges()).toBe(true);
    fireEvent.click(enabled);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds a picker edit (visibility) that no text field carries", async () => {
    await renderEditor();
    // The first checkbox of each milestone row is its visibility toggle; the
    // tool's own "Tool Enabled" comes first.
    const rows = screen.getAllByRole("checkbox");
    fireEvent.click(rows[1]);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("holds nothing once Cancel closes the editor", async () => {
    const typedInto = await renderEditor();
    fireEvent.input(typedInto, { target: { value: "Edited" } });
    expect(hasUnsavedChanges()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("Editor closed");
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds nothing after a successful save closes the editor", async () => {
    const typedInto = await renderEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tool Enabled" }));
    fireEvent.input(typedInto, { target: { value: "Edited" } });
    expect(hasUnsavedChanges()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await screen.findByText("Editor closed");
    expect(mockSaveJourneyToolAction).toHaveBeenCalledTimes(1);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("keeps holding the edits when the save is refused", async () => {
    mockSaveJourneyToolAction.mockResolvedValue({ success: false, error: "Unauthorized" });
    await renderEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tool Enabled" }));

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await screen.findByText("Unauthorized");
    expect(hasUnsavedChanges()).toBe(true);
  });
});
