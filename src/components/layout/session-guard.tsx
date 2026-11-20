"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { clearSignInLoop } from "@/lib/sign-in-loop";
import { hasUnsavedChanges, trackTypedInput } from "@/lib/unsaved-changes";

/**
 * SessionGuard: leave a protected page when its session ends in the browser
 * (upstream MPNext 02731d4, adapted with the owner's "warn and wait" change).
 *
 * AuthWrapper checks the session once, on the server. Without this, a tab left
 * open after signing out elsewhere, or past the 12h session cap, kept showing
 * the member data it had already loaded: the shared-PC exposure.
 *
 * WHAT BETTER-AUTH 1.7.18'S CLIENT DOES (node_modules/better-auth/dist/client/),
 * which the transition rule below is built on:
 * - A refetch first sets `isRefetching: true`, `error: null` and
 *   `isPending: data === null`, KEEPING `data` (session-atom.mjs:57-64). A live
 *   session never reads as absent mid-refetch.
 * - An ended session (signed out, expired, or gone after a restart once the
 *   cookie cache has lapsed, below) is a 200 with a `null` body
 *   (api/routes/session.mjs:41,47,153-164), which lands as
 *   `data: null, error: null, isPending: false, isRefetching: false`
 *   (session-atom.mjs:98-107, normalizeSessionData :30-34). That is the ONLY
 *   state this guard acts on, and only after a session was seen.
 * - A thrown fetch (network down) keeps the old `data` and sets `error`
 *   (session-atom.mjs:109-119); so does a non-401 HTTP error such as a 429
 *   (:86-96). Neither is an ended session, and neither acts.
 * - A 401 sets `data: null` WITH `error` (:88-90). Not acted on either: our
 *   /get-session answers an ended session with 200 null, and its one 401 path
 *   (session.mjs:198-208) is a failed sliding refresh, which
 *   `disableSessionRefresh: true` turns off (session.mjs:181-183). The next refetch that answers 200
 *   null clears `error` and then acts.
 * - Refetch triggers: on mount (session-atom.mjs:154-158), when the tab becomes
 *   VISIBLE again (focus-manager.mjs:16-18 via session-refresh.mjs:33-37, at
 *   most once per 5 s), when the browser comes back online
 *   (session-refresh.mjs:64-67), and on another tab's `better-auth.message`
 *   localStorage write (broadcast-channel.mjs:27-31, session-refresh.mjs:53-56).
 *   better-auth does not poll by default (`refetchInterval` 0,
 *   session-refresh.mjs:12), so a tab that simply STAYS visible never asked
 *   again. Two additions close that:
 *   1. `sessionOptions.refetchInterval: 300` on the client (@/lib/auth-client):
 *      a `setInterval` (session-refresh.mjs:48-51) that refetches every 5
 *      minutes, but only while the atom holds a session (`shouldPollSession`,
 *      session-atom.mjs:161) and only while online (session-refresh.mjs:19-23).
 *      It does not look at visibility, so hidden tabs poll too, subject to the
 *      browser's background-timer throttling.
 *   2. The expiry timer below: while live, a timeout for the session's own
 *      `expiresAt` + 5 s calls `refetch()`, so the 12h cap ends the page on
 *      time rather than at the next poll.
 *
 * WHAT A REFETCH CAN SEE. /get-session answers from the signed `session_data`
 * cookie cache while it is valid (1h, `refreshCache: false`;
 * api/routes/session.mjs:55-95), without consulting the in-memory store. So:
 * - Sign-out in THIS browser (any tab) deletes the cookies, and the 12h cap
 *   lapses the cached copy too (its own `expiresAt`, session.mjs:72-74): the
 *   next poll, visibility refetch or the expiry timer sees them promptly.
 * - A container RESTART empties the store but not the cookie cache: until that
 *   cache lapses (within 1h of when it was minted) /get-session still answers
 *   with the session, and the guard notices the restart only then, not at the
 *   next poll.
 *
 * NO SIGN-OUT BROADCAST. better-auth posts that localStorage message only from
 * its own client `/sign-out` call (config.mjs:78), which we never make, and
 * `getGlobalBroadcastChannel` is exported (client/index.mjs:22), so we could
 * post one ourselves. We do not, for two reasons:
 * 1. Timing. Our sign-out is a server action that deletes the session and then
 *    redirects off-origin to MP's end-session URL; the client's promise does
 *    not settle before the page leaves. A post made before the action races the
 *    deletion (another tab's GET can still see the session alive and do
 *    nothing), and there is no reliable moment after it.
 * 2. It would make every open tab leave at once. Each one would land on
 *    /signin and start its own OAuth flow, and all of them share ONE
 *    `oauth_state` cookie, so all but the last would end on
 *    `/auth-error?error=state_mismatch`.
 *
 * HIDDEN TABS remove the page but start sign-in only when shown. The poll and
 * the expiry timer run in hidden tabs, and every tab of one session shares its
 * `expiresAt`, so several hidden tabs can see the end at once. "Stop showing
 * the data" and "start signing in" are therefore split: on "leave" the
 * children stop rendering at once in every tab, hidden or not (the PII leaves
 * the screen), but `location.replace('/signin…')` runs only while
 * `document.visibilityState === 'visible'`; a hidden tab waits for its first
 * `visibilitychange` to visible and navigates once then. That avoids the
 * parallel flows of point 2 for tabs in one window (two windows both on
 * screen are both 'visible' and can still race), and on a shared PC it never leaves an unattended
 * tab mid-OAuth for the next person to complete. A hidden tab that HOLDS
 * does nothing visible either; if its re-check later finds nothing unsaved,
 * it switches to "leave" under the same rule.
 *
 * ON THE TRANSITION (a session was seen, now settled-absent):
 * - Nothing unsaved: the children stop rendering at once, so the PII leaves
 *   the screen, and `location.replace('/signin?callbackUrl=<path+search>')`
 *   follows, at once in a visible tab, when shown in a hidden one.
 *   /signin re-signs-in silently while MP's own session is alive (the documented
 *   12h-cap / post-deploy behaviour; the owner kept it over a /signed-out page).
 * - Unsaved edits (@/lib/unsaved-changes): the owner's "warn and wait". The
 *   page stays, under a modal warning: sign in again in a NEW tab, come back,
 *   and the visibility refetch finds the session, the warning clears, and the
 *   edits can be saved. Or discard them and sign in here. The page's data stays
 *   on screen (dimmed, not interactive) while the warning shows; that is the
 *   trade the owner chose over losing a half-written note.
 * - The hold is not permanent. While holding, the edits are re-checked every
 *   2 s and on every refetch that again settles null; once nothing unsaved is
 *   left (the field was cleared, or the dialog holding it unmounted), the tab
 *   leaves as above. PII is kept on screen only while there is something to
 *   protect.
 * Initial null, pending, refetching and error never act.
 *
 * THE WARNING IS A RADIX AlertDialog, ALWAYS OPEN WHILE HOLDING. The edits are
 * often inside a modal Radix Dialog (the contact-log note, the journey and
 * compliance detail modals, the transition dialog). A modal Dialog sets
 * `body { pointer-events: none }`, aria-hides everything outside its portal and
 * traps focus, so a plain banner rendered beside it could not be clicked or
 * focused; and a click on that banner would count as a click OUTSIDE the
 * dialog and dismiss it, unmounting the note. As the newest DismissableLayer
 * the AlertDialog is stacked above the open Dialog
 * (node_modules/@radix-ui/react-dismissable-layer 1.2.1, dist/index.mjs):
 * - Pointer events: a layer is enabled only when its index is at or above the
 *   highest layer that disables outside pointer events (:46-52); its own
 *   style turns pointer events back on for it (:147). The AlertDialog is that
 *   highest layer, so its buttons get the clicks.
 * - The Dialog underneath is NOT dismissed: its outside-pointer handler runs
 *   only when `isPointerEventsEnabled` for that layer (:65-76), which is now
 *   false, so a pointerdown on the warning returns early (:257-262) without
 *   dispatching the dismiss. Escape is handled only by the highest layer
 *   (:90, :101-107), which is ours, and we prevent it. Moving focus into the
 *   warning is a focus-outside for the Dialog, which a modal Dialog prevents
 *   itself (@radix-ui/react-dialog 1.3.1, dist/index.mjs:184-187).
 * - Focus: a new FocusScope pauses the one below (@radix-ui/react-focus-scope
 *   1.3.1, dist/index.mjs:246-258), so the Dialog's trap does not pull focus
 *   back. An AlertDialog never closes on an outside click
 *   (@radix-ui/react-alert-dialog 1.2.1, dist/index.mjs:62-63).
 * Focus goes to the warning's TITLE (tabIndex -1), not to a button: someone
 * mid-sentence would otherwise press "Discard" with their next Space or
 * Enter. When the warning closes, focus returns to where it was.
 *
 * IDENTITY. The user of every live session is remembered (MP `userGuid`,
 * stable across sign-ins; better-auth's `user.id` is not, since the in-memory
 * store makes a new user row on each sign-in after a restart, so it is only a
 * fallback). If a later live session belongs to someone else, after a hold or
 * not, the page is reloaded rather than kept: its data and any edits were
 * loaded for the previous user, and must not be shown to, or saved as, the
 * next one.
 *
 * Seeing a live session also clears the /signin loop counter
 * (@/lib/sign-in-loop).
 */



type EndedVerdict = "hold" | "leave";

/** How often a held page re-checks whether it still holds unsaved edits. */
export const HOLD_RECHECK_INTERVAL_MS = 2_000;

/** How long after `expiresAt` the expiry timer asks the server again. */
export const EXPIRY_REFETCH_GRACE_MS = 5_000;

/** setTimeout's ceiling (2^31 - 1 ms, about 24.8 days); longer waits re-arm. */
const MAX_TIMEOUT_MS = 2_147_483_647;

function signInUrlForThisPage(): string {
  const { pathname, search } = window.location;
  return `/signin?callbackUrl=${encodeURIComponent(pathname + search)}`;
}

/** Where "Sign in again in a new tab" goes: home, so this tab keeps its edits. */
export const NEW_TAB_SIGN_IN_URL = "/signin?callbackUrl=%2F";

type SessionShape = {
  user?: { id?: unknown; userGuid?: unknown } | null;
  session?: { expiresAt?: unknown } | null;
} | null;

/** Who a live session belongs to: the MP User_GUID, else better-auth's user id. */
function identityOf(data: SessionShape): string | null {
  const user = data?.user;
  if (!user) return null;
  if (typeof user.userGuid === "string" && user.userGuid !== "") return `guid:${user.userGuid}`;
  if (typeof user.id === "string" && user.id !== "") return `id:${user.id}`;
  return null;
}

/** The session's `expiresAt` in ms, or null when absent or unparseable. */
function expiresAtOf(data: SessionShape): number | null {
  const raw = data?.session?.expiresAt;
  let ms: number;
  if (raw instanceof Date) ms = raw.getTime();
  else if (typeof raw === "string" || typeof raw === "number") ms = new Date(raw).getTime();
  else return null;
  return Number.isFinite(ms) ? ms : null;
}

export function SessionGuard({ children }: { children: ReactNode }) {
  const { data, isPending, isRefetching, error, refetch } = authClient.useSession();
  const session = (data ?? null) as SessionShape;
  const live = session != null;
  const settledAbsent = !live && !isPending && !isRefetching && !error;
  const identity = live ? identityOf(session) : null;
  const expiresAt = live ? expiresAtOf(session) : null;

  // Derived state ("storing information from previous renders"), not effects:
  // whether this tab has had a live session, whose it was, and the verdict
  // for the current ended episode. The verdict is decided in the render where
  // the session is first seen gone, from the DOM as it was last committed,
  // i.e. before anything is unmounted. Deciding later would unmount the form
  // first and lose the very edits it is protecting.
  const [seenLive, setSeenLive] = useState(false);
  const [seenIdentity, setSeenIdentity] = useState<string | null>(null);
  const [switchedUser, setSwitchedUser] = useState(false);
  const [verdict, setVerdict] = useState<EndedVerdict | null>(null);
  const [wasEnded, setWasEnded] = useState(false);

  if (live && !seenLive) setSeenLive(true);
  if (live && identity !== null) {
    if (seenIdentity === null) setSeenIdentity(identity);
    else if (identity !== seenIdentity && !switchedUser) setSwitchedUser(true);
  }
  const ended = seenLive && settledAbsent;
  if (ended && verdict === null) setVerdict(hasUnsavedChanges() ? "hold" : "leave");
  if (ended !== wasEnded) {
    setWasEnded(ended);
    // A refetch that settled null AGAIN while holding (the visibility refetch,
    // "check again"): re-check whether there is still anything to protect.
    if (ended && verdict === "hold" && !hasUnsavedChanges()) setVerdict("leave");
  }
  // The hold ends only when a session is live again. A refetch in between
  // (the tab regaining visibility) briefly reads as pending, not ended; keeping
  // the verdict through it stops the warning flickering and re-taking focus.
  // "leave" is final: the page is already gone, and the navigation is under
  // way (or, in a hidden tab, waiting for the tab to be shown).
  if (live && verdict === "hold") setVerdict(null);

  // Record typing for as long as the guarded shell is mounted.
  useEffect(() => trackTypedInput(), []);

  useEffect(() => {
    if (live) clearSignInLoop();
  }, [live]);

  // Leaving: the page is already gone (see the render below); the sign-in
  // starts only in a VISIBLE tab. A hidden tab waits for its first change to
  // visible, so tabs in one window that end together (they share `expiresAt`
  // and the poll) don't start parallel OAuth flows over the one `oauth_state` cookie, and an
  // unattended tab never leaves a flow parked for the next person at a shared
  // PC to complete. See the header ("HIDDEN TABS").
  useEffect(() => {
    if (verdict !== "leave") return;
    // Removing the listener before navigating makes it fire at most once.
    const go = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", go);
      window.location.replace(signInUrlForThisPage());
    };
    document.addEventListener("visibilitychange", go);
    go();
    return () => document.removeEventListener("visibilitychange", go);
  }, [verdict]);

  useEffect(() => {
    if (switchedUser) window.location.reload();
  }, [switchedUser]);

  // While holding, keep asking whether the edits are still there.
  useEffect(() => {
    if (verdict !== "hold") return;
    const id = setInterval(() => {
      if (!hasUnsavedChanges()) setVerdict("leave");
    }, HOLD_RECHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [verdict]);

  // While live, ask the server again just after the session's own expiry, so a
  // tab that stays visible past the 12h cap ends on time. `refetch` is stable
  // (session-atom.mjs:47); a refetch that returns the same session keeps the
  // same `expiresAt`, so this does not re-arm in a loop.
  useEffect(() => {
    if (expiresAt === null) return;
    const due = expiresAt + EXPIRY_REFETCH_GRACE_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const wait = due - Date.now();
      if (wait <= 0) {
        void refetch();
        return;
      }
      timer = setTimeout(arm, Math.min(wait, MAX_TIMEOUT_MS));
    };
    timer = setTimeout(arm, 0);
    return () => clearTimeout(timer);
  }, [expiresAt, refetch]);

  if (switchedUser) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <p role="status" className="text-muted-foreground">
          You are signed in as a different user. Reloading…
        </p>
      </div>
    );
  }

  if (verdict === "leave" || (ended && verdict === null)) {
    // Leaving, or the one render before the verdict lands: render no children.
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <p role="status" className="text-muted-foreground">
          Your session has ended. Taking you to sign in…
        </p>
      </div>
    );
  }

  return (
    <>
      {verdict === "hold" ? (
        <SessionEndedWarning
          onSignInNewTab={() => {
            window.open(NEW_TAB_SIGN_IN_URL, "_blank", "noopener");
          }}
          onCheckAgain={() => {
            void refetch();
          }}
          onDiscard={() => setVerdict("leave")}
        />
      ) : null}
      {children}
    </>
  );
}

function SessionEndedWarning({
  onSignInNewTab,
  onCheckAgain,
  onDiscard,
}: {
  onSignInNewTab: () => void;
  onCheckAgain: () => void;
  onDiscard: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const returnFocusTo = useRef<Element | null>(null);

  // Always open while it is rendered; SessionGuard unmounts it to close it.
  // No onOpenChange: nothing inside may close it except SessionGuard's state.
  return (
    <AlertDialog open>
      <AlertDialogContent
        data-testid="session-ended-warning"
        className="border-t-4 border-t-amber-500"
        onOpenAutoFocus={(event) => {
          // Not a button: see the header ("Focus goes to the warning's TITLE").
          // Preventing the default also skips the AlertDialog's own handler,
          // which would focus its Cancel button (composeEventHandlers).
          event.preventDefault();
          returnFocusTo.current = document.activeElement;
          title.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          // The modal Dialog's default sends focus to its trigger, which we do
          // not have; put it back where the user was typing instead.
          event.preventDefault();
          const target = returnFocusTo.current;
          if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle ref={title} tabIndex={-1} className="text-amber-900 focus:outline-none">
            Your session has ended
          </AlertDialogTitle>
          <AlertDialogDescription className="text-amber-900">
            Your unsaved changes are still on this page. Sign in again in a new tab, then come back
            here and save them. Saving before you sign in again will not work.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:flex-wrap">
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            Discard changes and sign in
          </button>
          <button
            type="button"
            onClick={onCheckAgain}
            className="rounded-md border border-amber-700 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            I&apos;ve signed in, check again
          </button>
          <button
            type="button"
            onClick={onSignInNewTab}
            className="rounded-md bg-[#344767] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d3a5f] focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            Sign in again in a new tab
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
