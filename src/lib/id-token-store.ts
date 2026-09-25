/**
 * Holds each signed-in user's OIDC ID token just long enough to sign them out.
 *
 * WHY THIS EXISTS RATHER THAN READING THE ACCOUNT RECORD
 *
 * Sign-out needs `id_token_hint`, or Ministry Platform discards
 * `post_logout_redirect_uri` and strands the user on its own logged-out page.
 * better-auth does store the token on the account record, so the obvious
 * implementation reads it back with `findAccountByUserId`. That was tried and
 * it does not work here. A diagnostic added on 2026-09-18 reported
 * `no-mp-account` on a real sign-out, four days into a container's life, from
 * a user who had signed in minutes earlier.
 *
 * Two configuration choices combine to cause it:
 *
 *   1. `session.cookieCache.strategy: "jwt"` — the session is carried in the
 *      `session_data` cookie, so `auth.api.getSession` answers without
 *      touching any store — but ONLY while that one-hour cache is fresh. The
 *      session therefore looks perfectly healthy. Once the cache lapses,
 *      `getSession` falls through to its own module instance's store, which in
 *      a server action is the empty one described below, and returns null.
 *      So sign-out's session lookup depends on a fresh cookie too, which is
 *      why the user menu re-mints it through `GET /api/auth/get-session` (the
 *      route handler, whose store holds the session) before signing out.
 *   2. No `database` is configured, so better-auth uses its in-memory adapter.
 *      That store lives in whichever module instance created it.
 *
 * Sign-in runs in the `/api/auth/[...all]` route handler; sign-out runs in a
 * server action. Those are separate bundles, and a module imported by both can
 * be instantiated more than once — the same chunk-duplication problem this
 * codebase already documents for `serviceCache`, which is why that one is
 * pinned to `globalThis`. The account is written into one instance's memory and
 * read from another's, which is empty. Nothing errors; the lookup just finds
 * nothing.
 *
 * So the token is captured at sign-in, where it is definitely in hand, and
 * parked on `globalThis` — one object per PROCESS rather than per module
 * instance.
 *
 * WHAT THIS IS NOT. It is not a session store and must not become one. It
 * holds identity assertions that are already expiring, keyed by a value the
 * session carries anyway, for the sole purpose of one redirect.
 *
 * Losing an entry is fine and expected — a container restart empties it. The
 * caller degrades to signing out without the hint, which is the behaviour that
 * shipped before this existed: still signed out, just left on MP's page.
 */

/** Ceiling on retained tokens, so this cannot grow without bound. */
const MAX_ENTRIES = 500;

/** Discard anything older than this even if nobody signs out. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

interface Entry {
  idToken: string;
  storedAt: number;
}

/**
 * Pinned to `globalThis`, not a module-level `const`. A module-level value
 * would be duplicated per bundle and this would fail exactly the way the
 * account lookup it replaces already failed.
 */
function store(): Map<string, Entry> {
  const g = globalThis as typeof globalThis & { __mpIdTokens?: Map<string, Entry> };
  if (!g.__mpIdTokens) {
    g.__mpIdTokens = new Map<string, Entry>();
  }
  return g.__mpIdTokens;
}

function prune(m: Map<string, Entry>, now: number): void {
  for (const [key, entry] of m) {
    if (now - entry.storedAt > MAX_AGE_MS) m.delete(key);
  }
  // Map iterates in insertion order, so the oldest survivors go first.
  while (m.size > MAX_ENTRIES) {
    const oldest = m.keys().next();
    if (oldest.done) break;
    m.delete(oldest.value);
  }
}

/**
 * Called during sign-in, from `getUserInfo`, which is the one place holding
 * both the tokens and the validated Ministry Platform GUID.
 *
 * A missing or empty token is not an error — it just means sign-out will fall
 * back to no hint.
 */
export function rememberIdToken(userGuid: string, idToken: string | undefined | null): void {
  if (!userGuid || !idToken) return;
  const m = store();
  const now = Date.now();
  // Re-insert so a fresh sign-in moves this key to the newest position.
  m.delete(userGuid);
  m.set(userGuid, { idToken, storedAt: now });
  prune(m, now);
}

/**
 * Called during sign-out. REMOVES the entry: it has served its one purpose,
 * and holding an identity assertion any longer than needed buys nothing.
 */
export function takeIdToken(userGuid: string | undefined | null): string | null {
  if (!userGuid) return null;
  const m = store();
  const entry = m.get(userGuid);
  if (!entry) return null;
  m.delete(userGuid);
  if (Date.now() - entry.storedAt > MAX_AGE_MS) return null;
  return entry.idToken;
}

/** Test seam. Never call this from application code. */
export function __resetIdTokenStore(): void {
  store().clear();
}
