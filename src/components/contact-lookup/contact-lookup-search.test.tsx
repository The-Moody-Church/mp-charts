import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockSearchContacts } = vi.hoisted(() => ({
  mockSearchContacts: vi.fn(),
}));

vi.mock("./actions", () => ({
  searchContacts: mockSearchContacts,
}));

import { ContactLookupSearch } from "./contact-lookup-search";

/**
 * Guards the "Active contacts only" scope, which used to be re-applied by a
 * `useEffect` keyed on `activeOnly` (flagged by react-hooks/immutability — the
 * effect called `handleSearch` before its `const` declaration). That effect was
 * replaced by an explicit, REQUIRED `scopeActiveOnly` parameter.
 *
 * The regression these exist to catch: searching with the STALE scope, which
 * silently returns or hides inactive contacts with no visible error. Reading
 * `activeOnly` from state inside the change handler would do exactly that,
 * because the handler sees the pre-commit value.
 */
describe("ContactLookupSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchContacts.mockResolvedValue([]);
  });

  const typeQuery = (value: string) =>
    fireEvent.change(screen.getByRole("textbox"), { target: { value } });

  it("searches with activeOnly=true by default", async () => {
    render(<ContactLookupSearch />);

    typeQuery("smith");
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => expect(mockSearchContacts).toHaveBeenCalledWith("smith", true));
  });

  it("re-runs the search with the NEW scope when the toggle changes after a search", async () => {
    render(<ContactLookupSearch />);

    typeQuery("smith");
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => expect(mockSearchContacts).toHaveBeenCalledWith("smith", true));

    // Unchecking must search with `false`, not the stale `true`.
    fireEvent.click(screen.getByRole("checkbox"));

    await waitFor(() => expect(mockSearchContacts).toHaveBeenLastCalledWith("smith", false));
    expect(mockSearchContacts).toHaveBeenCalledTimes(2);
  });

  it("does not search when the toggle is changed before any search has run", () => {
    render(<ContactLookupSearch />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(mockSearchContacts).not.toHaveBeenCalled();
  });

  it("searches on Enter with the current scope", async () => {
    render(<ContactLookupSearch />);

    fireEvent.click(screen.getByRole("checkbox")); // scope -> false, no search yet
    typeQuery("smith");
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    await waitFor(() => expect(mockSearchContacts).toHaveBeenCalledWith("smith", false));
  });

  it("clearing resets the searched state so a later toggle does not re-query", async () => {
    render(<ContactLookupSearch />);

    typeQuery("smith");
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
    await waitFor(() => expect(mockSearchContacts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    fireEvent.click(screen.getByRole("checkbox"));

    expect(mockSearchContacts).toHaveBeenCalledTimes(1);
  });
});
