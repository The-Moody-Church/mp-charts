import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * The (web) error boundary keeps a way out (upstream MPNext f3cb739, adapted):
 * when it renders, the header's user menu may be gone with the page, so it
 * offers Sign out next to Try Again / Return Home.
 */

const { mockHandleSignOut } = vi.hoisted(() => ({ mockHandleSignOut: vi.fn() }));
vi.mock("@/components/user-menu/actions", () => ({ handleSignOut: mockHandleSignOut }));

import WebError from "./error";

const makeError = (message: string) => Object.assign(new Error(message), { digest: "d1" });

describe("(web) error boundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockHandleSignOut.mockResolvedValue(undefined);
  });

  it("offers Try Again and Sign out; Sign out calls handleSignOut with no arguments", () => {
    const retry = vi.fn();
    render(<WebError error={makeError("boom")} retry={retry} />);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mockHandleSignOut).toHaveBeenCalledExactlyOnceWith();
  });

  it("offers Sign out on the access-denied variant too", () => {
    render(<WebError error={makeError("Forbidden: insufficient permissions")} retry={vi.fn()} />);

    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(mockHandleSignOut).toHaveBeenCalledTimes(1);
  });
});
