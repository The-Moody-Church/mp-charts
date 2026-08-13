import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ComplianceToolConfig } from "@/lib/compliance-tools-config-types";

const {
  mockGetJourneyMilestones,
  mockGetAvailableJourneys,
  mockSaveComplianceToolAction,
} = vi.hoisted(() => ({
  mockGetJourneyMilestones: vi.fn(),
  mockGetAvailableJourneys: vi.fn(),
  mockSaveComplianceToolAction: vi.fn(),
}));

vi.mock("./actions", () => ({
  getDeduplicatedRequirements: vi.fn().mockResolvedValue([]),
  saveComplianceToolAction: mockSaveComplianceToolAction,
}));

vi.mock("@/components/admin/journey-tools/actions", () => ({
  getAvailableJourneys: mockGetAvailableJourneys,
  getJourneyMilestones: mockGetJourneyMilestones,
  getAvailablePrograms: vi.fn().mockResolvedValue([]),
  getProgramsByIds: vi.fn().mockResolvedValue([]),
  getAvailableGroups: vi.fn().mockResolvedValue([]),
  getGroupsByIds: vi.fn().mockResolvedValue([]),
  getAvailableGroupRoles: vi.fn().mockResolvedValue([]),
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
