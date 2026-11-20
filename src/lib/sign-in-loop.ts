/**
 * Sign-in loop cap (upstream MPNext 595ecab, adapted).
 *
 * `/signin` navigates on its own twice over: it starts the Ministry Platform
 * OAuth flow when there is no session, and it bounces an already-signed-in
 * user to the callback URL. This caps THOSE navigations, /signin's own: each
 * one is recorded in sessionStorage (per tab), and the third within two
 * minutes is refused, so the page shows a stop state instead of starting
 * another OAuth flow against MP SSO. The case it is for is /signin bouncing
 * back to itself, e.g. a callback URL that lands on /signin again, or an MP
 * callback that keeps returning without a session.
 *
 * What it does NOT stop: a guard -> /signin -> MP -> callback -> guard cycle.
 * SessionGuard clears this counter whenever it sees a live session, and in
 * that cycle every lap passes through a page where the guard saw one, so the
 * count never builds up. Such a cycle also cannot start on its own: the guard
 * leaves only after seeing a session and then a settled null from
 * /get-session, the same endpoint /signin's check reads.
 *
 * Fails open by design. Every storage access is in a try/catch, and storage
 * that throws (blocked, private mode, quota) or holds garbage reads as "no
 * recent navigations": a broken counter must never stop a normal sign-in.
 *
 * The counter is cleared by SessionGuard whenever it sees a live session (a
 * sign-in finished, so whatever /signin was doing is over), by the stop
 * state's own "Try again" button (a person, not a loop), and simply by time:
 * entries a full window old are dropped.
 *
 * Client-only: imported by the sign-in page and SessionGuard.
 */

/** sessionStorage key. Per tab, so one looping tab never blocks another. */
export const SIGN_IN_LOOP_STORAGE_KEY = "tmc.signin.automaticNavigations";

/** The window the cap counts over. */
export const SIGN_IN_LOOP_WINDOW_MS = 2 * 60 * 1000;

/** Automatic navigations allowed inside the window; the next one is refused. */
export const SIGN_IN_LOOP_MAX_AUTOMATIC = 2;

function readRecent(now: number): number[] {
  try {
    const raw = window.sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Keep only timestamps inside the window. A future timestamp (clock moved
    // back) is dropped too, so it cannot hold the cap shut.
    return parsed.filter(
      (t): t is number =>
        typeof t === "number" && Number.isFinite(t) && t <= now && now - t < SIGN_IN_LOOP_WINDOW_MS
    );
  } catch {
    return [];
  }
}

function write(timestamps: number[]): void {
  try {
    window.sessionStorage.setItem(SIGN_IN_LOOP_STORAGE_KEY, JSON.stringify(timestamps));
  } catch {
    // Fail open: an unrecorded navigation only weakens the cap.
  }
}

/*
 * "This page refused a navigation", as a tiny external store. The sign-in page
 * reads it with useSyncExternalStore (server snapshot: false), which keeps the
 * stop state out of React state set inside an effect
 * (react-hooks/set-state-in-effect) and out of the server render (no hydration
 * mismatch). It lives as long as the document does.
 */
let stopped = false;
const stopListeners = new Set<() => void>();

function setStopped(value: boolean): void {
  if (stopped === value) return;
  stopped = value;
  for (const listener of stopListeners) listener();
}

export function subscribeSignInLoopStop(listener: () => void): () => void {
  stopListeners.add(listener);
  return () => {
    stopListeners.delete(listener);
  };
}

export function isSignInLoopStopped(): boolean {
  return stopped;
}

/**
 * Call immediately before an automatic navigation. Returns true, and records
 * it, when the navigation may go ahead; returns false, recording nothing and
 * raising the stop flag, when it would be the third inside the window.
 */
export function recordAutomaticSignInNavigation(now: number = Date.now()): boolean {
  const recent = readRecent(now);
  if (recent.length >= SIGN_IN_LOOP_MAX_AUTOMATIC) {
    setStopped(true);
    return false;
  }
  write([...recent, now]);
  return true;
}

/** Forgets every recorded navigation and lowers the stop flag. Never throws. */
export function clearSignInLoop(): void {
  setStopped(false);
  try {
    window.sessionStorage.removeItem(SIGN_IN_LOOP_STORAGE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
