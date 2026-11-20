import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { CurrentUserProfile } from "@/lib/dto/user-profile";

/**
 * Header: the user menu is the shell's only sign-out control, so once the
 * profile has finished loading it is mounted whether or not a profile arrived
 * (upstream MPNext f3cb739, adapted). A user with no dp_Users row, or one
 * signed in while MP is failing, must still be able to sign out.
 */

const { mockUseUser, mockHandleSignOut } = vi.hoisted(() => ({
  mockUseUser: vi.fn(),
  mockHandleSignOut: vi.fn(),
}));

vi.mock("@/contexts", () => ({
  useUser: mockUseUser,
  useAppSession: () => ({ user: { name: "Sam Ortiz" } }),
  useRuntimeConfig: () => ({ mpFileUrl: null, appName: "MP Tools" }),
}));
vi.mock("./sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/user-menu/actions", () => ({ handleSignOut: mockHandleSignOut }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { getSession: vi.fn().mockResolvedValue({ data: null, error: null }) },
}));

import { Header } from "./header";

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

async function openUserMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: /user menu/i }), { button: 0, ctrlKey: false });
  return within(await screen.findByRole("menu"));
}

const profile: CurrentUserProfile = {
  First_Name: "Samuel",
  Nickname: "Sam",
  Last_Name: "Ortiz",
  Email_Address: "sam@example.com",
  Image_GUID: null,
};

describe("Header user menu", () => {
  beforeEach(() => {
    installJsdomPolyfills();
    mockHandleSignOut.mockResolvedValue(undefined);
  });

  it("offers Sign out when loading finished WITHOUT a profile", async () => {
    mockUseUser.mockReturnValue({ userProfile: null, isLoading: false });

    render(<Header />);
    const menu = await openUserMenu();

    expect(menu.getByText("Your profile couldn't be loaded")).toBeInTheDocument();
    expect(menu.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("offers Sign out with the user's name when the profile loaded", async () => {
    mockUseUser.mockReturnValue({ userProfile: profile, isLoading: false });

    render(<Header />);
    const menu = await openUserMenu();

    expect(menu.getByText("Sam Ortiz")).toBeInTheDocument();
    expect(menu.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("shows a disabled placeholder, and no menu, while the profile is loading", () => {
    mockUseUser.mockReturnValue({ userProfile: null, isLoading: true });

    render(<Header />);
    const button = screen.getByRole("button", { name: /user menu/i });

    expect(button).toBeDisabled();
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
