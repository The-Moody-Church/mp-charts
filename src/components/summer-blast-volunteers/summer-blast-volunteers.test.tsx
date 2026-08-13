import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { SummerBlastIntakeCard, SummerBlastVolunteerCard } from "@/lib/dto";

const {
  mockGetSummerBlastIntake,
  mockGetSummerBlastVolunteers,
  mockBulkAddToSummerBlast,
} = vi.hoisted(() => ({
  mockGetSummerBlastIntake: vi.fn(),
  mockGetSummerBlastVolunteers: vi.fn(),
  mockBulkAddToSummerBlast: vi.fn(),
}));

vi.mock("./actions", () => ({
  getSummerBlastIntake: mockGetSummerBlastIntake,
  getSummerBlastVolunteers: mockGetSummerBlastVolunteers,
  bulkAddToSummerBlast: mockBulkAddToSummerBlast,
  addToSummerBlast: vi.fn(),
  removeFromSummerBlast: vi.fn(),
}));

import { SummerBlastVolunteers } from "./summer-blast-volunteers";

/**
 * Guards the per-open reset of both Summer Blast detail modals, and the pruning
 * of bulk selection after a partial bulk-add.
 *
 * Written against the `useEffect(..., [open])` hand-resets, and must keep passing
 * once those are replaced by a remount. The trap the reopen tests exist to catch
 * is `key={responseId}` / `key={groupParticipantId}`: the parent never clears
 * `selectedIntake` / `selectedVolunteer` on close (so Radix can animate out), so a
 * record-ID key does NOT remount when the SAME record is reopened — the reset
 * silently stops happening, and only for the same-record case.
 *
 * Both consequences are MP writes, not cosmetics: a stale Group_Role_ID on the
 * intake modal, and a pre-armed "Confirm Remove" that end-dates a Group_Participant.
 */
describe("SummerBlastVolunteers", () => {
  const person = (contactId: number, firstName: string) => ({
    Contact_ID: contactId,
    Participant_ID: contactId + 1000,
    Nickname: null,
    Last_Name: "Tester",
    First_Name: firstName,
    Image_GUID: null,
    Group_Participant_ID: null,
    Start_Date: null,
    Email_Address: null,
    Mobile_Phone: null,
  });

  const intakeCard = (responseId: number, firstName: string): SummerBlastIntakeCard => ({
    info: person(responseId, firstName),
    checklist: [],
    completedCount: 0,
    totalCount: 0,
    isFullyCompliant: false,
    hasWillExpire: false,
    age: 30,
    responseId,
    responseDate: "2026-06-01",
    comments: null,
  });

  const volunteerCard = (groupParticipantId: number, firstName: string): SummerBlastVolunteerCard => ({
    info: { ...person(groupParticipantId, firstName), Group_Participant_ID: groupParticipantId },
    checklist: [],
    completedCount: 0,
    totalCount: 0,
    isFullyCompliant: false,
    hasWillExpire: false,
    age: 30,
    groupParticipantId,
    groupRoleId: 2,
    groupRoleLabel: "Temp",
    startDate: "2026-06-01",
    notes: null,
  });

  const renderScreen = async () => {
    render(
      <SummerBlastVolunteers
        eventName="Summer Blast"
        eventEndDate="2026-08-31"
        roleOptions={[
          { groupRoleId: 11, label: "Small Group Leader" },
          { groupRoleId: 12, label: "Crew" },
        ]}
        tempGroupRoleId={2}
      />
    );
    await screen.findByText("Alice Tester");
  };

  const dialog = () => screen.getByRole("dialog");
  const closeDialog = () => fireEvent.keyDown(dialog(), { key: "Escape" });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSummerBlastIntake.mockResolvedValue([intakeCard(1, "Alice"), intakeCard(2, "Bob")]);
    mockGetSummerBlastVolunteers.mockResolvedValue([volunteerCard(90, "Vera")]);
  });

  it("resets the Group Role select when the SAME signup is reopened", async () => {
    await renderScreen();

    fireEvent.click(screen.getByText("Alice Tester"));
    const roleSelect = await screen.findByLabelText(/group role/i);
    fireEvent.change(roleSelect, { target: { value: "11" } });
    expect((roleSelect as HTMLSelectElement).value).toBe("11");

    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Same card, not a different one — this is the case a record-ID key misses.
    fireEvent.click(screen.getByText("Alice Tester"));

    const reopened = await screen.findByLabelText(/group role/i);
    expect((reopened as HTMLSelectElement).value).toBe("");
  });

  it("resets the Group Role select when a DIFFERENT signup is opened", async () => {
    await renderScreen();

    fireEvent.click(screen.getByText("Alice Tester"));
    fireEvent.change(await screen.findByLabelText(/group role/i), { target: { value: "12" } });

    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Bob Tester"));

    expect(((await screen.findByLabelText(/group role/i)) as HTMLSelectElement).value).toBe("");
  });

  it("disarms 'Confirm Remove' when the SAME volunteer is reopened", async () => {
    await renderScreen();

    // Radix TabsTrigger switches on mousedown/focus, not on a synthetic click.
    fireEvent.mouseDown(screen.getByRole("tab", { name: /volunteers/i }), { button: 0 });
    fireEvent.click(await screen.findByText("Vera Tester"));

    fireEvent.click(await within(dialog()).findByRole("button", { name: /remove from group/i }));
    expect(within(dialog()).getByRole("button", { name: /confirm remove/i })).toBeDefined();

    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Vera Tester"));

    // A pre-armed destructive control would end-date a Group_Participant on one click.
    const reopened = await screen.findByRole("dialog");
    expect(within(reopened).queryByRole("button", { name: /confirm remove/i })).toBeNull();
    expect(within(reopened).getByRole("button", { name: /remove from group/i })).toBeDefined();
  });

  it("keeps only the failed row selected after a partial bulk add", async () => {
    await renderScreen();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(await screen.findByText(/2 selected/i)).toBeDefined();

    // Alice (responseId 1) succeeds and leaves the intake list; Bob (2) fails and stays.
    mockBulkAddToSummerBlast.mockResolvedValue({
      succeededCount: 1,
      failures: [{ responseId: 2, error: "MP rejected the write" }],
    });
    mockGetSummerBlastIntake.mockResolvedValue([intakeCard(2, "Bob")]);

    fireEvent.click(screen.getByRole("button", { name: /confirm sb spreadsheet addition/i }));

    expect(await screen.findByText(/Added 1; 1 failed/i)).toBeDefined();
    // The succeeded row is pruned from the selection; the failed one stays checked
    // so it can be retried.
    await waitFor(() => expect(screen.getByText(/1 selected/i)).toBeDefined());
    expect(screen.getByRole("checkbox")).toHaveProperty("dataset.state", "checked");
  });

  it("clears the whole selection when every row is added successfully", async () => {
    await renderScreen();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    mockBulkAddToSummerBlast.mockResolvedValue({ succeededCount: 2, failures: [] });
    mockGetSummerBlastIntake.mockResolvedValue([]);

    fireEvent.click(screen.getByRole("button", { name: /confirm sb spreadsheet addition/i }));

    await waitFor(() => expect(screen.queryByText(/selected/i)).toBeNull());
  });
});
