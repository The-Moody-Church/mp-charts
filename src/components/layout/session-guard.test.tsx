import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState, type ReactNode } from "react";

/**
 * SessionGuard (upstream MPNext 02731d4, with the owner's "warn and wait").
 *
 * `authClient.useSession()` is mocked with the exact state shapes
 * better-auth 1.7.18's session atom produces (see the component's header for
 * the file:line citations): a refetch keeps `data` and sets `isRefetching`;
 * an ended session settles as `data: null, error: null`; a network failure
 * keeps `data` and sets `error`; a 401 sets `data: null` WITH `error`.
 */

type SessionState = {
  data: unknown;
  isPending: boolean;
  isRefetching: boolean;
  error: unknown;
  refetch: () => Promise<void>;
};

const { mockUseSession, mockRefetch } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockRefetch: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: mockUseSession } }));

import {
  SessionGuard,
  NEW_TAB_SIGN_IN_URL,
  HOLD_RECHECK_INTERVAL_MS,
  EXPIRY_REFETCH_GRACE_MS,
} from "./session-guard";
import { useUnsavedChanges } from "@/lib/unsaved-changes";
import { SIGN_IN_LOOP_STORAGE_KEY } from "@/lib/sign-in-loop";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const LIVE = { user: { id: "u1", userGuid: "g" }, session: { id: "s1" } };
const state = (over: Partial<SessionState>): SessionState => ({
  data: null,
  isPending: false,
  isRefetching: false,
  error: null,
  refetch: mockRefetch,
  ...over,
});
const present = state({ data: LIVE });
const ended = state({});

const PAGE_TEXT = "Jane Member, pastoral note";

function Page({ children }: { children?: ReactNode }) {
  return (
    <div>
      <p>{PAGE_TEXT}</p>
      <textarea aria-label="Note" />
      <div data-session-guard-ignore="">
        <input aria-label="Search" type="text" />
      </div>
      {children}
    </div>
  );
}

function Dirty({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty);
  return null;
}

function mount(initial: SessionState, children: ReactNode = <Page />) {
  mockUseSession.mockReturnValue(initial);
  const view = render(<SessionGuard>{children}</SessionGuard>);
  const to = (next: SessionState, nextChildren: ReactNode = children) => {
    mockUseSession.mockReturnValue(next);
    view.rerender(<SessionGuard>{nextChildren}</SessionGuard>);
  };
  return { ...view, to };
}

function type(label: string, value: string) {
  const el = screen.getByLabelText(label) as HTMLTextAreaElement | HTMLInputElement;
  el.value = value;
  fireEvent.input(el);
}

/**
 * Whether a pointer can reach `el`, by CSS inheritance of the inline
 * `pointer-events` Radix sets: the nearest ancestor-or-self with a value
 * decides (the modal layer sets `none` on <body> and `auto` on itself).
 */
function pointerReachable(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const value = (node as HTMLElement).style?.pointerEvents;
    if (value) return value !== "none";
  }
  return true;
}

/** A real click as a browser delivers it, refused where pointer events are off. */
function clickLikeABrowser(el: Element) {
  if (!pointerReachable(el)) throw new Error("element has or inherits pointer-events: none");
  fireEvent.pointerDown(el, { button: 0 });
  fireEvent.mouseDown(el, { button: 0 });
  fireEvent.pointerUp(el, { button: 0 });
  fireEvent.mouseUp(el, { button: 0 });
  fireEvent.click(el, { button: 0 });
}

/**
 * Sets `document.visibilityState` (jsdom's is always "visible"), and with
 * `dispatch` fires `visibilitychange` as a browser does on a tab switch.
 */
function setVisibility(value: DocumentVisibilityState, dispatch = false) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  if (dispatch) act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

/** Radix registers its outside-pointer listener after a 0 ms timeout. */
const tick = () => act(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

/** The contact-log note dialog's shape: a modal Radix Dialog holding a textarea. */
function NoteDialog() {
  const [open, setOpen] = useState(true);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>Add contact log</DialogTitle>
        <DialogDescription>Notes for this contact</DialogDescription>
        <textarea aria-label="Dialog note" />
      </DialogContent>
    </Dialog>
  );
}

describe("SessionGuard", () => {
  const replace = vi.fn();
  const reload = vi.fn();
  const open = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("location", {
      origin: "http://localhost:3000",
      pathname: "/contact-lookup/abc",
      search: "?tab=logs&x=a b",
      replace,
      reload,
    });
    vi.stubGlobal("open", open);
    mockRefetch.mockResolvedValue(undefined);
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // Back to jsdom's own getter on Document.prototype ("visible").
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  it("renders the children while the session is present", () => {
    mount(present);

    expect(screen.getByText(PAGE_TEXT)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the children through a refetch of a live session", () => {
    const { to } = mount(present);

    to(state({ data: LIVE, isRefetching: true }));

    expect(screen.getByText(PAGE_TEXT)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("present -> ended with nothing unsaved: leaves for /signin with this page as callbackUrl, children gone", () => {
    const { to } = mount(present);

    to(ended);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/signin?callbackUrl=" + encodeURIComponent("/contact-lookup/abc?tab=logs&x=a b")
    );
    expect(screen.queryByText(PAGE_TEXT)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/session has ended/i);
  });

  it("leave is final: a session seen again does not bring the page back or navigate twice", () => {
    const { to } = mount(present);
    to(ended);
    expect(replace).toHaveBeenCalledTimes(1);

    to(present);

    expect(screen.queryByText(PAGE_TEXT)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/session has ended/i);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  describe("hidden tabs: remove the page, start sign-in only when shown", () => {
    const signInUrl = "/signin?callbackUrl=" + encodeURIComponent("/contact-lookup/abc?tab=logs&x=a b");

    it("hidden + ended + nothing unsaved: the page goes at once, /signin waits for the tab to be shown", () => {
      setVisibility("hidden");
      const { to } = mount(present);

      to(ended);

      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent(/session has ended/i);
      expect(replace).not.toHaveBeenCalled();

      // Still hidden (e.g. a visibilitychange to "hidden"): nothing yet.
      setVisibility("hidden", true);
      expect(replace).not.toHaveBeenCalled();

      setVisibility("visible", true);
      expect(replace).toHaveBeenCalledExactlyOnceWith(signInUrl);

      // Later switches never start a second flow.
      setVisibility("hidden", true);
      setVisibility("visible", true);
      expect(replace).toHaveBeenCalledTimes(1);
    });

    it("stops waiting when the guard unmounts while hidden", () => {
      setVisibility("hidden");
      const { to, unmount } = mount(present);
      to(ended);
      unmount();

      setVisibility("visible", true);

      expect(replace).not.toHaveBeenCalled();
    });

    it("a hidden tab holds without navigating; when the re-check finds nothing unsaved it leaves only once shown", () => {
      vi.useFakeTimers();
      setVisibility("hidden");
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(replace).not.toHaveBeenCalled();

      type("Note", "");
      act(() => vi.advanceTimersByTime(HOLD_RECHECK_INTERVAL_MS));

      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(replace).not.toHaveBeenCalled();

      setVisibility("visible", true);
      expect(replace).toHaveBeenCalledExactlyOnceWith(signInUrl);
    });

    it("leave is final while hidden too: a session seen again keeps the page gone", () => {
      setVisibility("hidden");
      const { to } = mount(present);
      to(ended);

      to(present);
      expect(screen.queryByText(PAGE_TEXT)).toBeNull();

      setVisibility("visible", true);
      expect(replace).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    ["an initial null (never seen a session)", [state({ isPending: true }), ended]],
    ["a pending refetch", [present, state({ isPending: true, isRefetching: true })]],
    ["a refetch with no data yet", [present, state({ isRefetching: true })]],
    ["a network failure (data kept, error set)", [present, state({ data: LIVE, error: new TypeError("Failed to fetch") })]],
    ["a 401 (data null WITH error)", [present, state({ error: { status: 401, message: "Unauthorized" } })]],
    ["any error with data null", [present, state({ error: { status: 500 } })]],
  ] as const)("does not act on %s", (_label, sequence) => {
    const [first, ...rest] = sequence;
    const { to } = mount(first);
    for (const next of rest) to(next);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText(PAGE_TEXT)).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("acts once a failed refetch is followed by a settled null", () => {
    const { to } = mount(present);
    to(state({ error: { status: 401 } }));
    expect(replace).not.toHaveBeenCalled();

    to(ended);

    expect(replace).toHaveBeenCalledTimes(1);
  });

  describe("unsaved edits: warn and wait", () => {
    it("holds the page and warns when a typed textarea still has text", () => {
      const { to } = mount(present);
      type("Note", "Visited Sunday, family doing well");

      to(ended);

      expect(replace).not.toHaveBeenCalled();
      const warning = screen.getByRole("alertdialog");
      expect(warning).toHaveTextContent(/session has ended/i);
      expect(warning).toHaveTextContent(/unsaved changes are still on this page/i);
      expect(screen.getByText(PAGE_TEXT)).toBeInTheDocument();
      expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe(
        "Visited Sunday, family doing well"
      );
    });

    it("focuses the warning's title, never one of its buttons (no focus steal mid-keystroke)", () => {
      const { to } = mount(present);
      const note = screen.getByLabelText("Note");
      note.focus();
      type("Note", "Visited Sunday");

      to(ended);

      const title = screen.getByRole("heading", { name: /your session has ended/i });
      expect(document.activeElement).toBe(title);
      expect(document.activeElement?.tagName).not.toBe("BUTTON");
      expect(title).toHaveAttribute("tabindex", "-1");
    });

    it("redirects when the textarea was typed into and then cleared", () => {
      const { to } = mount(present);
      type("Note", "draft");
      type("Note", "");

      to(ended);

      expect(replace).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("does not hold for a typed search box marked data-session-guard-ignore", () => {
      const { to } = mount(present);
      type("Search", "Ortiz");

      to(ended);

      expect(replace).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
    });

    it("holds for useUnsavedChanges(true)", () => {
      const children = (
        <Page>
          <Dirty dirty />
        </Page>
      );
      const { to } = mount(present, children);

      to(ended, children);

      expect(replace).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });

    it("does not hold for useUnsavedChanges(false)", () => {
      const children = (
        <Page>
          <Dirty dirty={false} />
        </Page>
      );
      const { to } = mount(present, children);

      to(ended, children);

      expect(replace).toHaveBeenCalledTimes(1);
    });

    it("'Discard changes and sign in' leaves for /signin", () => {
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);

      fireEvent.click(screen.getByRole("button", { name: /discard changes and sign in/i }));

      expect(replace).toHaveBeenCalledExactlyOnceWith(
        "/signin?callbackUrl=" + encodeURIComponent("/contact-lookup/abc?tab=logs&x=a b")
      );
      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
    });

    it("'Sign in again in a new tab' opens /signin in a new tab and keeps this page", () => {
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);

      fireEvent.click(screen.getByRole("button", { name: /sign in again in a new tab/i }));

      expect(NEW_TAB_SIGN_IN_URL).toBe("/signin?callbackUrl=%2F");
      expect(open).toHaveBeenCalledExactlyOnceWith("/signin?callbackUrl=%2F", "_blank", "noopener");
      expect(replace).not.toHaveBeenCalled();
      expect(screen.getByText(PAGE_TEXT)).toBeInTheDocument();
    });

    it("'check again' asks better-auth to refetch the session", () => {
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);

      fireEvent.click(screen.getByRole("button", { name: /check again/i }));

      expect(mockRefetch).toHaveBeenCalledTimes(1);
      expect(replace).not.toHaveBeenCalled();
    });

    it("keeps the warning, and focus, through a refetch that finds no session", () => {
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);
      const warning = screen.getByRole("alertdialog");
      const checkAgain = screen.getByRole("button", { name: /check again/i });
      checkAgain.focus();

      // Tab regains visibility without having signed in: pending, then null again.
      to(state({ isPending: true, isRefetching: true }));
      expect(screen.getByRole("alertdialog")).toBe(warning);
      to(state({ error: new TypeError("Failed to fetch") }));
      expect(screen.getByRole("alertdialog")).toBe(warning);
      to(ended);

      expect(screen.getByRole("alertdialog")).toBe(warning);
      // Not re-focused to the title: the warning was not remounted.
      expect(document.activeElement).toBe(checkAgain);
      expect(replace).not.toHaveBeenCalled();
    });

    it("does not show the page again while leaving, even if a refetch is in flight", () => {
      const { to } = mount(present);
      to(ended);
      expect(replace).toHaveBeenCalledTimes(1);

      to(state({ isPending: true, isRefetching: true }));

      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
      expect(replace).toHaveBeenCalledTimes(1);
    });

    it("clears the warning when the session comes back, and guards again after", () => {
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      // Back from the new tab: the visibility refetch finds the session.
      to(state({ isRefetching: true, isPending: true }));
      to(present);

      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByText(PAGE_TEXT)).toBeInTheDocument();

      // Saved and cleared, then the session ends again: it now leaves.
      type("Note", "");
      to(ended);
      expect(replace).toHaveBeenCalledTimes(1);
    });

    it("leaves once the held edit is cleared (re-checked every 2 s)", () => {
      vi.useFakeTimers();
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(HOLD_RECHECK_INTERVAL_MS));
      expect(replace).not.toHaveBeenCalled();

      type("Note", "");
      act(() => vi.advanceTimersByTime(HOLD_RECHECK_INTERVAL_MS));

      expect(replace).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("leaves once the field holding the edit unmounts", () => {
      vi.useFakeTimers();
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      // The dialog or form holding the note closes on its own.
      to(ended, <p>{PAGE_TEXT}</p>);
      expect(replace).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(HOLD_RECHECK_INTERVAL_MS));

      expect(replace).toHaveBeenCalledTimes(1);
    });

    it("re-checks on a refetch that settles null again, without waiting for the timer", () => {
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);

      type("Note", "");
      to(state({ isPending: true, isRefetching: true }));
      expect(replace).not.toHaveBeenCalled();
      to(ended);

      expect(replace).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
    });

    it("keeps holding through re-checks while the edit is still there", () => {
      vi.useFakeTimers();
      const { to } = mount(present);
      type("Note", "draft");
      to(ended);

      act(() => vi.advanceTimersByTime(HOLD_RECHECK_INTERVAL_MS * 5));
      to(state({ isPending: true, isRefetching: true }));
      to(ended);

      expect(replace).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  describe("over an open modal Radix Dialog (the contact-log note)", () => {
    it("shows a warning that is clickable, does not dismiss the dialog, and keeps its text", async () => {
      const { to } = mount(present, <Page><NoteDialog /></Page>);
      await tick();
      const note = screen.getByLabelText("Dialog note") as HTMLTextAreaElement;
      note.focus();
      note.value = "Prayed with the family; follow up Tuesday";
      fireEvent.input(note);

      to(ended, <Page><NoteDialog /></Page>);
      await tick();

      const warning = screen.getByRole("alertdialog");
      expect(warning).toHaveTextContent(/session has ended/i);
      // The open Dialog turned pointer events off for everything outside it,
      // and the warning is now the layer above it.
      expect(pointerReachable(note)).toBe(false);
      const checkAgain = screen.getByRole("button", { name: /check again/i });
      expect(pointerReachable(checkAgain)).toBe(true);
      expect(document.activeElement?.tagName).not.toBe("BUTTON");

      clickLikeABrowser(checkAgain);
      await tick();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
      await tick();

      expect(mockRefetch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alertdialog")).toBe(warning);
      const dialog = screen.getByRole("dialog", { hidden: true });
      expect(dialog).toHaveTextContent("Add contact log");
      expect(dialog.contains(note)).toBe(true);
      expect(note.isConnected).toBe(true);
      expect(note.value).toBe("Prayed with the family; follow up Tuesday");

      // Signed in again in another tab: the warning goes, the dialog and its
      // text are still there and usable, and focus is back in the note.
      to(present, <Page><NoteDialog /></Page>);
      await tick();

      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(screen.getByRole("dialog")).toBe(dialog);
      expect(note.value).toBe("Prayed with the family; follow up Tuesday");
      expect(pointerReachable(note)).toBe(true);
      expect(document.activeElement).toBe(note);
      expect(replace).not.toHaveBeenCalled();
    });

    it("'Discard changes and sign in' is clickable over the dialog", async () => {
      const { to } = mount(present, <Page><NoteDialog /></Page>);
      await tick();
      const note = screen.getByLabelText("Dialog note") as HTMLTextAreaElement;
      note.value = "draft";
      fireEvent.input(note);
      to(ended, <Page><NoteDialog /></Page>);
      await tick();

      clickLikeABrowser(screen.getByRole("button", { name: /discard changes and sign in/i }));

      expect(replace).toHaveBeenCalledTimes(1);
    });
  });

  describe("identity", () => {
    const userA = { user: { id: "u1", userGuid: "guid-a" }, session: { id: "s1" } };
    const userB = { user: { id: "u2", userGuid: "guid-b" }, session: { id: "s2" } };

    it("A -> ended (hold) -> B reloads instead of keeping A's page and edits", () => {
      const { to } = mount(state({ data: userA }));
      type("Note", "A's draft");
      to(ended);
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      to(state({ data: userB }));

      expect(reload).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    });

    it("A -> ended (hold) -> A clears the warning and keeps the page", () => {
      const { to } = mount(state({ data: userA }));
      type("Note", "A's draft");
      to(ended);

      to(state({ data: { ...userA, session: { id: "s9" } } }));

      expect(reload).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe("A's draft");
    });

    it("A -> B with no ended state in between also reloads", () => {
      const { to } = mount(state({ data: userA }));

      to(state({ data: userB }));

      expect(reload).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
    });

    it("falls back to better-auth's user id when there is no userGuid: u1 -> ended (hold) -> u2 reloads", () => {
      const { to } = mount(state({ data: { user: { id: "u1" }, session: { id: "s1" } } }));
      type("Note", "u1's draft");
      to(ended);
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      to(state({ data: { user: { id: "u2" }, session: { id: "s2" } } }));

      expect(reload).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(PAGE_TEXT)).toBeNull();
      expect(replace).not.toHaveBeenCalled();
    });

    it("falls back to better-auth's user id when there is no userGuid: u1 -> ended (hold) -> u1 keeps the page", () => {
      const { to } = mount(state({ data: { user: { id: "u1" }, session: { id: "s1" } } }));
      type("Note", "u1's draft");
      to(ended);

      to(state({ data: { user: { id: "u1" }, session: { id: "s9" } } }));

      expect(reload).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect((screen.getByLabelText("Note") as HTMLTextAreaElement).value).toBe("u1's draft");
    });

    it("keys on the MP userGuid, not better-auth's user id (new after a restart)", () => {
      const { to } = mount(state({ data: userA }));
      type("Note", "draft");
      to(ended);

      to(state({ data: { user: { id: "u-after-restart", userGuid: "guid-a" }, session: { id: "s3" } } }));

      expect(reload).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  describe("expiry timer", () => {
    it("refetches just after the session's expiresAt, while the tab stays visible", () => {
      vi.useFakeTimers();
      const expiresAt = new Date(Date.now() + 60_000);
      const { unmount } = mount(state({ data: { ...LIVE, session: { id: "s1", expiresAt } } }));

      act(() => vi.advanceTimersByTime(60_000 + EXPIRY_REFETCH_GRACE_MS - 1));
      expect(mockRefetch).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(1));
      expect(mockRefetch).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(60 * 60_000));
      expect(mockRefetch).toHaveBeenCalledTimes(1);
      unmount();
    });

    it("accepts an ISO string expiresAt and re-arms a wait past setTimeout's ceiling", () => {
      vi.useFakeTimers();
      const thirtyDays = 30 * 24 * 60 * 60_000;
      const expiresAt = new Date(Date.now() + thirtyDays).toISOString();
      mount(state({ data: { ...LIVE, session: { id: "s1", expiresAt } } }));

      act(() => vi.advanceTimersByTime(2_147_483_647));
      expect(mockRefetch).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(thirtyDays - 2_147_483_647 + EXPIRY_REFETCH_GRACE_MS));
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it("clears the timer when the session ends or the guard unmounts", () => {
      vi.useFakeTimers();
      const expiresAt = new Date(Date.now() + 60_000);
      const withExpiry = state({ data: { ...LIVE, session: { id: "s1", expiresAt } } });
      const first = mount(withExpiry);
      first.to(ended);
      act(() => vi.advanceTimersByTime(120_000));
      expect(mockRefetch).not.toHaveBeenCalled();
      first.unmount();

      const second = mount(withExpiry);
      second.unmount();
      act(() => vi.advanceTimersByTime(120_000));
      expect(mockRefetch).not.toHaveBeenCalled();
    });
  });

  it("clears the /signin loop counter when it sees a live session", () => {
    sessionStorage.setItem(SIGN_IN_LOOP_STORAGE_KEY, JSON.stringify([Date.now(), Date.now()]));
    const { to } = mount(state({ isPending: true }));
    expect(sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY)).not.toBeNull();

    act(() => to(present));

    expect(sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY)).toBeNull();
  });
});
