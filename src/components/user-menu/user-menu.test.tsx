import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { MPUserProfile } from "@/lib/providers/ministry-platform/types";

/**
 * UserMenu: the app's only sign-out control.
 *
 * What is pinned here is the sign-out SEQUENCE, because the part that matters
 * cannot be seen: `handleSignOut` finds the user's ID token for
 * `id_token_hint` through the session, and a server action can read the
 * session only from the one-hour JWT cookie cache (see
 * `src/lib/id-token-store.ts`). So the menu calls `authClient.getSession()`
 * first — `GET /api/auth/get-session` runs in the auth route handler, which
 * holds the session and re-issues the cookie. Skip that and sign-out still
 * works; the user is just stranded on MP's logged-out page, and only the server
 * log says why.
 *
 * `./actions` is mocked in full (it is covered by `actions.test.ts`), and so is
 * the auth client, the same way `sign-in.test.tsx` mocks it.
 */

const { mockHandleSignOut, mockGetSession } = vi.hoisted(() => ({
  mockHandleSignOut: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("./actions", () => ({
  handleSignOut: mockHandleSignOut,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: mockGetSession },
}));

import { UserMenu } from "./user-menu";

// Radix primitives need a few browser APIs jsdom does not implement. Without
// these, DropdownMenu throws on mount rather than failing an assertion.
function installJsdomPolyfills() {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
}

/**
 * Runs `run()` with Node's unhandled-rejection reporting diverted into an array
 * and returns what was collected. The click handler's promise is not awaited by
 * anything, so a rejection inside it surfaces only here.
 */
async function captureUnhandledRejections(run: () => Promise<void>): Promise<unknown[]> {
  const captured: unknown[] = [];
  const priorListeners = process.listeners("unhandledRejection");
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", (reason) => captured.push(reason));

  try {
    await run();
    // Node reports an unhandled rejection only after the microtask queue has
    // drained; yield the macrotask turns that takes before reading the result.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return captured;
  } finally {
    process.removeAllListeners("unhandledRejection");
    for (const listener of priorListeners) {
      process.on("unhandledRejection", listener as NodeJS.UnhandledRejectionListener);
    }
  }
}

const profile: MPUserProfile = {
  User_ID: 7,
  User_GUID: "ab12cd34-ef56-7890-abcd-ef1234567890",
  Contact_ID: 42,
  First_Name: "Samuel",
  Nickname: "Sam",
  Last_Name: "Ortiz",
  Email_Address: "sam@example.com",
  Mobile_Phone: null,
  Image_GUID: null,
  roles: [],
  userGroups: [],
  userGroupIds: [],
};

/** Renders the menu, opens it, and returns its menu scope. */
async function openMenu(onClose?: () => void) {
  render(
    <UserMenu userProfile={profile} onClose={onClose}>
      <button type="button">Open user menu</button>
    </UserMenu>
  );
  // Radix opens on pointerdown (primary button), not click.
  fireEvent.pointerDown(screen.getByRole("button", { name: /open user menu/i }), {
    button: 0,
    ctrlKey: false,
  });
  return within(await screen.findByRole("menu"));
}

describe("UserMenu", () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installJsdomPolyfills();
    vi.clearAllMocks();
    mockHandleSignOut.mockResolvedValue(undefined);
    mockGetSession.mockResolvedValue({ data: null, error: null });
    // jsdom's alert only logs "not implemented"; stub it so it is assertable.
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens from the supplied trigger and offers Sign out", async () => {
    const menu = await openMenu();

    expect(menu.getByText("Sam Ortiz")).toBeInTheDocument();
    expect(menu.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("does nothing merely by opening the menu", async () => {
    await openMenu();

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockHandleSignOut).not.toHaveBeenCalled();
  });

  it("calls handleSignOut once, with no arguments, when Sign out is selected", async () => {
    const menu = await openMenu();

    fireEvent.click(menu.getByRole("menuitem", { name: /sign out/i }));

    await waitFor(() => expect(mockHandleSignOut).toHaveBeenCalledTimes(1));
    expect(mockHandleSignOut).toHaveBeenCalledWith();
  });

  it("refreshes the session cookie through the auth route BEFORE the server action", async () => {
    // The server action can read the session only from the cookie cache; a
    // lapsed cache drops id_token_hint and strands the user on MP's page.
    const order: string[] = [];
    const onClose = vi.fn(() => {
      order.push("onClose");
    });
    mockGetSession.mockImplementation(async () => {
      // Settle on a later macrotask: a caller that fired the refresh without
      // AWAITING it would then record handleSignOut first and fail this test.
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.push("getSession");
      return { data: null, error: null };
    });
    mockHandleSignOut.mockImplementation(async () => {
      order.push("handleSignOut");
    });

    const menu = await openMenu(onClose);
    fireEvent.click(menu.getByRole("menuitem", { name: /sign out/i }));

    await waitFor(() => expect(mockHandleSignOut).toHaveBeenCalledTimes(1));
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["onClose", "getSession", "handleSignOut"]);
  });

  it("still signs out, silently, when the session refresh fails", async () => {
    mockGetSession.mockRejectedValue(new TypeError("Failed to fetch"));

    const escaped = await captureUnhandledRejections(async () => {
      const menu = await openMenu();
      fireEvent.click(menu.getByRole("menuitem", { name: /sign out/i }));

      await waitFor(() => expect(mockHandleSignOut).toHaveBeenCalledTimes(1));
    });

    expect(alertSpy).not.toHaveBeenCalled();
    // The refresh failure is swallowed, not left to escape the click handler.
    expect(escaped).toEqual([]);
  });

  it("still signs out when the refresh answers with an error instead of throwing", async () => {
    // better-auth's client reports HTTP failures in `error` rather than throwing.
    mockGetSession.mockResolvedValue({ data: null, error: { status: 500, message: "boom" } });

    const menu = await openMenu();
    fireEvent.click(menu.getByRole("menuitem", { name: /sign out/i }));

    await waitFor(() => expect(mockHandleSignOut).toHaveBeenCalledTimes(1));
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
