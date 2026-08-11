import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { MemberCard, MemberDetail } from "@/lib/dto";

const { mockFetchMembersAndCounts, mockFetchMemberDetail, mockUploadPhoto } = vi.hoisted(() => ({
  mockFetchMembersAndCounts: vi.fn(),
  mockFetchMemberDetail: vi.fn(),
  mockUploadPhoto: vi.fn(),
}));

vi.mock("./actions", () => ({
  fetchMembersAndCounts: mockFetchMembersAndCounts,
  fetchMemberDetail: mockFetchMemberDetail,
  fetchMemberStatuses: vi.fn().mockResolvedValue([]),
  fetchMilestoneFiles: vi.fn().mockResolvedValue([]),
  uploadMemberPhoto: mockUploadPhoto,
  transitionMember: vi.fn(),
  refreshMemberCache: vi.fn().mockResolvedValue({ success: true }),
}));

import { ManageMembersShell } from "./manage-members-shell";

/**
 * Guards the deep-link latch and the per-open detail refetch.
 *
 * Written against the `hasAutoOpened` state latch and the `[open, member]`
 * reset-and-fetch effect, and must keep passing once those become a ref latch and
 * a remount driven by a per-open counter.
 *
 * The refetch is load-bearing: milestones come from a live MP query, not the 6h
 * contacts cache, so a status change run elsewhere has to show up on reopen. Any
 * `key={contactId}` would break exactly the same-member case, because this shell
 * never clears `detailMember` on close.
 */
describe("ManageMembersShell", () => {
  const card = (contactId: number, firstName: string): MemberCard => ({
    contactId,
    participantId: contactId + 1000,
    displayName: `${firstName} Tester`,
    nickname: null,
    firstName,
    lastName: "Tester",
    email: null,
    mobilePhone: null,
    memberStatusId: 1,
    memberStatus: "Registered",
    contactStatusId: 1,
    fileUniqueId: null,
    dateJoined: null,
  });

  const detailFor = (c: MemberCard): MemberDetail => ({
    member: c,
    milestones: [
      {
        participantMilestoneId: 5000 + c.contactId,
        milestoneId: 9,
        milestoneName: "Membership Class",
        dateAccomplished: "2026-02-01",
        notes: `Notes for ${c.firstName}`,
      },
    ],
  });

  const renderShell = (initialMemberId?: number) =>
    render(
      <ManageMembersShell
        initialMembers={[card(1, "Alice"), card(2, "Bob")]}
        initialCounts={{ "1": 2 }}
        initialStatuses={[{ Member_Status_ID: 1, Member_Status: "Registered" }]}
        initialMemberId={initialMemberId}
      />
    );

  const closeDialog = () => fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchMembersAndCounts.mockImplementation(async () => ({
      members: [card(1, "Alice"), card(2, "Bob")],
      counts: { "1": 2 },
    }));
    mockFetchMemberDetail.mockImplementation(async (contactId: number) =>
      detailFor(card(contactId, contactId === 1 ? "Alice" : "Bob"))
    );
    mockUploadPhoto.mockResolvedValue({ success: true });
  });

  it("refetches the detail when the SAME member is reopened", async () => {
    renderShell();

    fireEvent.click(screen.getByText("Alice Tester"));
    await waitFor(() => expect(mockFetchMemberDetail).toHaveBeenCalledTimes(1));

    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Alice Tester"));

    await waitFor(() => expect(mockFetchMemberDetail).toHaveBeenCalledTimes(2));
    expect(mockFetchMemberDetail).toHaveBeenLastCalledWith(1);
  });

  it("collapses an expanded milestone when the SAME member is reopened", async () => {
    renderShell();

    fireEvent.click(screen.getByText("Alice Tester"));
    fireEvent.click(await screen.findByText("Membership Class"));
    expect(await screen.findByText("Notes for Alice")).toBeDefined();

    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Alice Tester"));

    // expandedId/recordFiles are separate state from the detail fetch, so this is
    // the reset assertion rather than the refetch one.
    await screen.findByText("Membership Class");
    expect(screen.queryByText("Notes for Alice")).toBeNull();
  });

  it("opens the deep-linked member and fetches its detail", async () => {
    renderShell(2);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Bob Tester");
    expect(mockFetchMemberDetail).toHaveBeenCalledWith(2);
  });

  it("does not re-apply the deep link when a later save refreshes the list", async () => {
    renderShell(1);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("Alice Tester");
    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByText("Bob Tester"));
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("Bob Tester"));

    const input = screen
      .getByRole("dialog")
      .querySelector('input[type="file"][accept^="image"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "photo.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(mockFetchMembersAndCounts).toHaveBeenCalled());
    expect(screen.getByRole("dialog").textContent).toContain("Bob Tester");
    expect(screen.getByRole("dialog").textContent).not.toContain("Alice Tester");
  });

  // NOT a characterization test — this asserts behavior the refactor ADDED. The
  // old `hasAutoOpened` state latch failed here: under StrictMode's double-invoke
  // the second run read the stale `false` from its own closure and fetched twice.
  // The ref mutates immediately, so it holds.
  it("fetches the deep-linked detail once under StrictMode's double invoke", () => {
    render(
      <StrictMode>
        <ManageMembersShell
          initialMembers={[card(1, "Alice"), card(2, "Bob")]}
          initialCounts={{ "1": 2 }}
          initialStatuses={[{ Member_Status_ID: 1, Member_Status: "Registered" }]}
          initialMemberId={2}
        />
      </StrictMode>
    );

    // Both effect invocations have already run; the modal cannot have fetched yet
    // because it only opens once this promise resolves.
    expect(mockFetchMemberDetail).toHaveBeenCalledTimes(1);
  });

  it("leaves the modal closed when there is no deep link", async () => {
    renderShell();

    await waitFor(() => expect(mockFetchMemberDetail).not.toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
