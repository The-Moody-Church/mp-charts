"use client";

import { createAuthClient } from "better-auth/react";
import { customSessionClient } from "better-auth/client/plugins";
import type { auth } from "./auth";

/**
 * How often (seconds) the browser re-asks `/get-session` while it holds a
 * session (batch 6). better-auth 1.7.18 defaults to 0, no polling
 * (node_modules/better-auth/dist/client/session-refresh.mjs:12), so a tab that
 * stayed visible never noticed a sign-out in another tab. With a value
 * set, session-refresh.mjs:48-51 runs a `setInterval` whose tick refetches only
 * while the session atom holds a session (`shouldPollSession`,
 * session-atom.mjs:161) and only while the browser is online
 * (session-refresh.mjs:19-23). It does not check visibility: hidden tabs poll
 * too, as often as the browser's background-timer throttling allows (a hidden
 * tab that finds the session ended removes the page but starts sign-in only
 * once shown; see SessionGuard). One GET per tab every 5 minutes. SessionGuard
 * acts on what it finds; its own expiry timer covers the 12h cap to the second.
 *
 * What a poll can see: /get-session answers from the 1h `session_data` cookie
 * cache while it is valid (`refreshCache: false`; api/routes/session.mjs
 * 55-95), so a sign-out in this browser (the cookies are deleted) and the 12h
 * cap show at the next poll, but a container RESTART shows only once that
 * cache lapses, within 1h, not at the next poll.
 */
export const SESSION_REFETCH_INTERVAL_SECONDS = 300;

// better-auth 1.7 removed genericOAuthClient: generic providers are reached
// through the core signIn.social / callback/:id endpoints.
export const authClient = createAuthClient({
  plugins: [customSessionClient<typeof auth>()],
  sessionOptions: { refetchInterval: SESSION_REFETCH_INTERVAL_SECONDS },
});
