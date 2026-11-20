import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { ComplianceToolConfig } from "@/lib/compliance-tools-config-types";
import { hasUnsavedChanges, trackTypedInput } from "@/lib/unsaved-changes";

const {
  mockGetJourneyMilestones,
  mockGetAvailableJourneys,
  mockSaveComplianceToolAction,
  mockGetDeduplicatedRequirements,
  mockGetAvailableGroupRoles,
} = vi.hoisted(() => ({
  mockGetJourneyMilestones: vi.fn(),
  mockGetAvailableJourneys: vi.fn(),
  mockSaveComplianceToolAction: vi.fn(),
  mockGetDeduplicatedRequirements: vi.fn(),
  mockGetAvailableGroupRoles: vi.fn(),
}));

vi.mock("./actions", () => ({
  getDeduplicatedRequirements: mockGetDeduplicatedRequirements,
  saveComplianceToolAction: mockSaveComplianceToolAction,
}));

vi.mock("@/components/admin/journey-tools/actions", () => ({
  getAvailableJourneys: mockGetAvailableJourneys,
  getJourneyMilestones: mockGetJourneyMilestones,
  getAvailablePrograms: vi.fn().mockResolvedValue([]),
  getProgramsByIds: vi.fn().mockResolvedValue([]),
  getAvailableGroups: vi.fn().mockResolvedValue([]),
  getGroupsByIds: vi.fn().mockResolvedValue([]),
  getAvailableGroupRoles: mockGetAvailableGroupRoles,
  getActiveMinistries: vi.fn().mockResolvedValue([]),
}));

import { ComplianceToolEditor } from "./compliance-tool-editor";

/**
 * Guards the three-branch journey selection in the compliance tool editor.
 *
 * These were written against the effect keyed on `journeyId` (flagged by
 * react-hooks/set-state-in-effect for its synchronous `setLoadingMilestones(true)`)
 * and must keep passing once that effect moves into the `<select>`'s onChange.
 *
 * The branches are NOT the journey editor's — do not converge them. That editor's
 * select is `disabled={isEditing}` and merges MP's list against the saved config;
 * this one stays enabled, and switching back to the saved journey is a staff UNDO
 * that must restore the saved config verbatim without touching MP.
 */
describe("ComplianceToolEditor — journey selection", () => {
  const SAVED_JOURNEY_ID = 10;
  const OTHER_JOURNEY_ID = 20;

  const savedTool = (overrides: Partial<ComplianceToolConfig> = {}): ComplianceToolConfig => ({
    slug: "volunteer-compliance",
    toolName: "Volunteer Compliance",
    description: "",
    enabled: true,
    groupRoleIds: [5],
    journeyId: SAVED_JOURNEY_ID,
    // Customised by an admin: renamed, hidden, and dragged to second place.
    journeyMilestones: [
      { milestoneId: 100, label: "Renamed by admin", sortOrder: 2, visible: false },
    ],
    requirements: [
      { requirementId: 1, label: "Background Check", type: "background_check", sortOrder: 1, visible: true },
    ],
    programId: 7,
    trackingGroupId: null,
    defaultGroupRoleId: 2,
    supportsPause: false,
    pausedGroupId: null,
    pauseMilestoneId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  const renderEditor = async (existingTool: ComplianceToolConfig | null) => {
    render(
      <ComplianceToolEditor
        existingTool={existingTool}
        existingSlugs={[]}
        usedJourneyIds={[]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    // The reference-data effect gates the whole form behind a loading line.
    return screen.findByLabelText(/journey \(merge journey milestones/i);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeduplicatedRequirements.mockResolvedValue([]);
    mockGetAvailableGroupRoles.mockResolvedValue([]);
    mockGetAvailableJourneys.mockResolvedValue([
      { Journey_ID: SAVED_JOURNEY_ID, Journey_Name: "Volunteer Journey", Description: null, Active: true },
      { Journey_ID: OTHER_JOURNEY_ID, Journey_Name: "Membership Journey", Description: null, Active: true },
    ]);
    mockGetJourneyMilestones.mockImplementation((journeyId: number) =>
      Promise.resolve(
        journeyId === SAVED_JOURNEY_ID
          ? [{ Milestone_ID: 100, Milestone_Title: "MP Title For 100", Sort_Order: 1, Discontinued: false }]
          : [{ Milestone_ID: 200, Milestone_Title: "Orientation", Sort_Order: 1, Discontinued: false }]
      )
    );
    mockSaveComplianceToolAction.mockResolvedValue({ success: true });
  });

  it("opens an existing tool on its saved milestone config, without calling MP", async () => {
    await renderEditor(savedTool());

    expect(await screen.findByDisplayValue("Renamed by admin")).toBeDefined();
    expect(mockGetJourneyMilestones).not.toHaveBeenCalled();
  });

  it("loads fresh MP defaults when a different journey is picked, with no merge", async () => {
    const select = await renderEditor(savedTool());

    fireEvent.change(select, { target: { value: String(OTHER_JOURNEY_ID) } });

    expect(await screen.findByDisplayValue("Orientation")).toBeDefined();
    expect(mockGetJourneyMilestones).toHaveBeenCalledWith(OTHER_JOURNEY_ID);
    // The previous journey's customisation must not bleed into the new one.
    expect(screen.queryByDisplayValue("Renamed by admin")).toBeNull();

    // Asserted through the save payload rather than the rendered rows: the saved
    // milestone is hidden and sorted second, and a positional carry-over would
    // reproduce both while still rendering MP's title.
    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));
    await waitFor(() => expect(mockSaveComplianceToolAction).toHaveBeenCalled());
    expect(mockSaveComplianceToolAction.mock.calls[0][0]).toMatchObject({
      journeyId: OTHER_JOURNEY_ID,
      journeyMilestones: [{ milestoneId: 200, label: "Orientation", sortOrder: 1, visible: true }],
    });
  });

  it("restores the saved config with NO MP call when switching back to the saved journey", async () => {
    const select = await renderEditor(savedTool());

    fireEvent.change(select, { target: { value: String(OTHER_JOURNEY_ID) } });
    await screen.findByDisplayValue("Orientation");

    fireEvent.change(select, { target: { value: String(SAVED_JOURNEY_ID) } });

    // Verbatim restore — the admin's label is back, and MP's "MP Title For 100" is not used.
    expect(await screen.findByDisplayValue("Renamed by admin")).toBeDefined();
    expect(mockGetJourneyMilestones).toHaveBeenCalledTimes(1);
    expect(mockGetJourneyMilestones).not.toHaveBeenCalledWith(SAVED_JOURNEY_ID);
  });

  it("clears the milestones when the journey is detached", async () => {
    const select = await renderEditor(savedTool());
    await screen.findByDisplayValue("Renamed by admin");

    fireEvent.change(select, { target: { value: "" } });

    await waitFor(() => expect(screen.queryByDisplayValue("Renamed by admin")).toBeNull());
    expect(mockGetJourneyMilestones).not.toHaveBeenCalled();
  });

  it("saves an empty milestone list for a tool whose journey is already detached", async () => {
    // Pre-existing behavior, deliberately preserved: opening a tool that has
    // orphaned milestones but no journey drops them, so the next save writes [].
    await renderEditor(
      savedTool({
        journeyId: null,
        journeyMilestones: [{ milestoneId: 100, label: "Orphaned", sortOrder: 1, visible: true }],
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /^update$/i }));

    await waitFor(() => expect(mockSaveComplianceToolAction).toHaveBeenCalled());
    expect(mockSaveComplianceToolAction.mock.calls[0][0]).toMatchObject({
      journeyId: null,
      journeyMilestones: [],
    });
  });
});

/**
 * SessionGuard (batch 6) and the compliance tool editor. Both "Refresh from
 * MP" buttons and every group-role toggle swap a picker for a loading line
 * and back, so a typed label returns in a new input the typed-field tracker
 * never saw. The editor therefore declares useUnsavedChanges while its form
 * differs from what it loaded: false for an untouched editor (also across a
 * refresh), true after any edit (also across a refresh or a role toggle), and
 * over once the admin page unmounts it (Cancel, successful save).
 */
describe("ComplianceToolEditor unsaved changes (SessionGuard)", () => {
  // Saved in the opposite order to MP's: a refresh rebuilds both lists in
  // MP's order, which is not an edit.
  const savedTool: ComplianceToolConfig = {
    slug: "volunteer-compliance",
    toolName: "Volunteer Compliance",
    description: "",
    enabled: true,
    groupRoleIds: [5],
    journeyId: 10,
    journeyMilestones: [
      { milestoneId: 101, label: "Orientation", sortOrder: 2, visible: true },
      { milestoneId: 100, label: "Renamed by admin", sortOrder: 1, visible: true },
    ],
    requirements: [
      { requirementId: 2, label: "Child Safety Form", type: "form", sortOrder: 2, visible: true },
      { requirementId: 1, label: "Background Check", type: "background_check", sortOrder: 1, visible: true },
    ],
    programId: 7,
    trackingGroupId: null,
    defaultGroupRoleId: 2,
    supportsPause: false,
    pausedGroupId: null,
    pauseMilestoneId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  let stopTracking: () => void;
  beforeEach(() => {
    mockGetAvailableJourneys.mockResolvedValue([
      { Journey_ID: 10, Journey_Name: "Volunteer Journey", Description: null, Active: true },
    ]);
    mockGetAvailableGroupRoles.mockResolvedValue([
      { Group_Role_ID: 5, Role_Title: "Volunteer", Ministry_ID: null },
      { Group_Role_ID: 6, Role_Title: "Leader", Ministry_ID: null },
    ]);
    mockGetJourneyMilestones.mockResolvedValue([
      { Milestone_ID: 100, Milestone_Title: "MP Title For 100", Sort_Order: 1, Discontinued: false },
      { Milestone_ID: 101, Milestone_Title: "Orientation", Sort_Order: 2, Discontinued: false },
    ]);
    mockGetDeduplicatedRequirements.mockImplementation((roleIds: number[]) =>
      Promise.resolve([
        { requirementId: 1, label: "Background Check", type: "background_check" },
        { requirementId: 2, label: "Child Safety Form", type: "form" },
        ...(roleIds.includes(6) ? [{ requirementId: 3, label: "Leader Cert", type: "certification" }] : []),
      ]),
    );
    mockSaveComplianceToolAction.mockResolvedValue({ success: true });
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
      <ComplianceToolEditor
        existingTool={savedTool}
        existingSlugs={["volunteer-compliance"]}
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
    return (await screen.findByDisplayValue("Background Check")) as HTMLInputElement;
  };

  const settle = async (loadingText: string) => {
    await screen.findByText(loadingText);
    await waitFor(() => expect(screen.queryByText(loadingText)).toBeNull());
  };
  const refreshRequirements = async () => {
    fireEvent.click(screen.getAllByRole("button", { name: /refresh from mp/i })[0]);
    await settle("Loading requirements...");
  };
  const refreshMilestones = async () => {
    fireEvent.click(screen.getAllByRole("button", { name: /refresh from mp/i })[1]);
    await settle("Loading milestones...");
  };
  const toggleLeader = async () => {
    fireEvent.click(screen.getByRole("checkbox", { name: /Leader/ }));
    await settle("Loading requirements...");
  };

  it("holds nothing for an untouched editor, also after either Refresh from MP", async () => {
    await renderEditor();
    expect(hasUnsavedChanges()).toBe(false);

    await refreshRequirements();
    await refreshMilestones();
    expect(mockGetDeduplicatedRequirements).toHaveBeenCalledWith([5]);
    expect(mockGetJourneyMilestones).toHaveBeenCalledWith(10);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds nothing after a role is toggled on and off again", async () => {
    await renderEditor();
    await toggleLeader();
    expect(screen.getByDisplayValue("Leader Cert")).toBeDefined();
    expect(hasUnsavedChanges()).toBe(true);

    await toggleLeader();
    expect(screen.queryByDisplayValue("Leader Cert")).toBeNull();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("keeps holding a typed requirement label after Refresh from MP remounts its input", async () => {
    const typedInto = await renderEditor();
    fireEvent.input(typedInto, { target: { value: "Background Check (adult)" } });
    expect(hasUnsavedChanges()).toBe(true);

    await refreshRequirements();
    expect(screen.getByDisplayValue("Background Check (adult)")).not.toBe(typedInto);
    expect(typedInto.isConnected).toBe(false);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("keeps holding a typed requirement label across a role toggled on and off", async () => {
    const typedInto = await renderEditor();
    fireEvent.input(typedInto, { target: { value: "Background Check (adult)" } });

    await toggleLeader();
    await toggleLeader();
    // The roles are back to the saved set; only the label differs, and its
    // input is not the one the tracker saw.
    expect(screen.getByDisplayValue("Background Check (adult)")).not.toBe(typedInto);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("keeps holding a typed milestone label after its Refresh from MP", async () => {
    await renderEditor();
    const typedInto = screen.getByDisplayValue("Renamed by admin");
    fireEvent.input(typedInto, { target: { value: "Renamed twice" } });

    await refreshMilestones();
    expect(screen.getByDisplayValue("Renamed twice")).not.toBe(typedInto);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("holds nothing once Cancel closes the editor", async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tool Enabled" }));
    expect(hasUnsavedChanges()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("Editor closed");
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds nothing after a successful save closes the editor, and keeps holding after a refused one", async () => {
    mockSaveComplianceToolAction.mockResolvedValueOnce({ success: false, error: "Unauthorized" });
    await renderEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: "Tool Enabled" }));

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await screen.findByText("Unauthorized");
    expect(hasUnsavedChanges()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await screen.findByText("Editor closed");
    expect(hasUnsavedChanges()).toBe(false);
  });
});
