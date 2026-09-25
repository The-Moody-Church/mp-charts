# Session Summary — 2026-09-24

## Objective

Migrate better-auth 1.6.33 → 1.7.x, starting with mp-charts as the reference for the four apps that share this auth stack (mp-charts, mp-senior-care, event-manager, music-db). Upstream MPNext #68 was tracked as DEFERRED in `.claude/notes/upstream-sync-log.md`.

## Status: COMPLETED (2026-09-25) — localhost sign-in against production MP passed; `:dev` soak passed (human checks on #238; clean logs on #238 + #240); #238 and #240 merged and deployed

## What 1.7 actually requires (verified, not assumed)

Research ran against pristine 1.6.33 and 1.7.5 packages. Harnesses drove a full mocked Ministry Platform sign-in through both versions, and a production build was exercised in a real browser. The migration brief we started from was wrong in two places that mattered:

- **Callback path.** It is `/api/auth/callback/ministryplatform`, built from OUR providerId. The brief (and our own `route.ts` comment) said `/callback/ministry-platform`, which is upstream MPNext's providerId.
- **Which MP client.** Sign-in runs on `TM.Widgets` (`OIDC_CLIENT_ID`). `MPNext` is only the server-to-server data client. Several docs and comments said `MPNext`.

And 1.7 changes more than the brief listed:

| Change in 1.7 | What we did |
|---|---|
| `genericOAuthClient` and `signIn.oauth2` removed; plugin endpoints gone | `signIn.social({ provider: MP_PROVIDER_ID })`; allowlist `POST /sign-in/social`, `GET /callback/ministryplatform` |
| Account key read from the raw profile's `sub` (OIDC) or `id` | return both, plus explicit `accountSubject` |
| Discovery fetched **once at boot, no timeout, no retry**; a failure disables sign-in until restart | removed `discoveryUrl`; explicit MP endpoints (1.6's posture) |
| PKCE **defaults on** | `pkce: false` kept and now pinned by test |
| Nonce binding on with discovery; MP never echoes a nonce | `disableIdTokenNonceBinding: true` as a guard |
| `/sign-in/social` accepts a direct ID-token sign-in, plus `scopes`/`errorCallbackURL` overrides | body filter (`provider` + `callbackURL` only), `hooks.before` guard, id_token/userinfo `sub` cross-check |
| New OAuth error vocabulary | `/auth-error` mapping rewritten; our own `sign_in_start_failed` for a flow that cannot start |
| Built-in provider logout reads the empty in-memory account | `disableProviderLogout: true`; hand-built sign-out unchanged |

Unchanged and re-verified: `disabledPaths` (still 404s `/update-user`), the `input: true` requirement, `accountLinking` off, the synthetic `<sub>@mp.invalid` email, cookie names. 1.6 and 1.7 session cookies are mutually readable, so an upgrade or rollback does not sign anyone out.

## Work

| PR / branch | What | Status |
|---|---|---|
| #237 `chore/zod-4.5-floor` | zod `^4.3.6` → `^4.5.4` (1.7.5 requires it), landed first so the auth PR is one variable | open, CI |
| #238 `chore/better-auth-1.7` (stacked on #237) | the migration | open as draft |
| #239 `fix/safe-callback-url-dot-segments` | pre-existing open redirect found by the review | open |
| #240 `fix/signout-refresh-session-cookie` (stacked on #238) | sign-out keeps `id_token_hint` after the one-hour cookie cache lapses (below) | open as draft |

Gates on the 1.7 branch: tsc, eslint (0 problems), `npm audit --audit-level=high` 0, **886/886 tests in 58 files** (825 in 56 before; auth files stable under shuffled order), `next build` (no discovery fetch), `check:shells` 19 shells. **27 mutation checks** each turn at least one test red. The tests previously re-simulated the OAuth callbacks in-file and passed against the wrong 1.7 contract; they now call the configured `getUserInfo`/`mapProfileToUser` taken from `auth.options`, and `route.flow.test.ts` runs a whole sign-in through the real route against a fake MP (token exchange included, where it proves no `code_verifier` is sent).

An adversarial review (5 lenses, every finding checked by an independent skeptic) confirmed 12 distinct issues, none a blocker, all fixed on the branch: `getMpUserInfo` could still throw on a non-JSON 200; a multi-valued Content-Type let better-auth parse the `/sign-in/social` body differently from our filter (now pinned to exactly `application/json`); the sub cross-check's fail-closed branch, the sign-in component's behaviour and the full callback path had no tests; and several doc/comment corrections. It also found a **pre-existing open redirect** in `getSafeCallbackUrl` (`/.//evil.com` normalises to `//evil.com`), fixed separately rather than inside this sign-in change.

### Files changed (1.7 branch)

- `package.json`, `package-lock.json` — better-auth `>=1.7.5 <1.8.0` (lock 1.7.5)
- `src/lib/auth.ts` — explicit endpoints, `sub`/`accountSubject`, nonce + provider-logout flags, `hooks.before`, sub cross-check, `getMpUserInfo` never throws, comment corrections
- `src/lib/auth-client.ts` — drop `genericOAuthClient`
- `src/components/sign-in/sign-in.tsx` — `signIn.social`, failure-to-start → `/auth-error`
- `src/app/api/auth/[...all]/route.ts` — new allowlist + `/sign-in/social` body filter
- `src/app/auth-error/page.tsx` — 1.7 error codes
- Tests: new `route.flow.test.ts` and `sign-in.test.tsx`; changed `route.test.ts`, `auth.test.ts`, `auth-scopes.test.ts`, `auth-endsession.test.ts`, `signin/page.test.tsx`, `auth-error/page.test.tsx`, `src/auth.test.ts` (re-simulation removed)
- `.github/dependabot.yml` — ignore better-auth minors/majors
- Docs: `CLAUDE.md`, `README.md`, `.env.example`, `docs/OAUTH_LOGOUT_SETUP.md`, `.claude/notes/upstream-sync-log.md`, `.claude/commands/pr.md` (`--repo` flag), `docs/status.md`, `docs/ideas.md`

## Decisions

- **Keep providerId `ministryplatform`.** Renaming to upstream's buys nothing (in-memory adapter, no data to migrate), adds ~6 edit sites per repo, and `localhost:3000`'s new path is already registered under this name.
- **Register the new redirect URIs instead of shimming the old path.** A `redirectURI` override plus a route rewrite would avoid the admin step, but it puts non-standard code in the security-critical route and was never tested against live MP.
- **No discovery (explicit endpoints).** It removes the boot-time outage mode, the zero-clock-skew id_token check and the ID-token sign-in branch in one move. Switching back is a 3-line diff with the guards already in place.
- **Pin 1.7.5, not 1.7.6** (released today): every result above was produced on 1.7.5. 1.7.6 will arrive as a Dependabot patch after the soak.
- **Leave the `BETTER_AUTH_SECRET` boot check out of the sibling migrations** (they lack it). It is unrelated to 1.7 and turns a missing secret into a crash loop, so it goes in its own PR.

## Next steps (in order)

1. MP administrator adds the four `https://<host>/api/auth/callback/ministryplatform` URIs to **TM.Widgets** (add only; keep the old ones for rollback). Verify with the probe in `docs/OAUTH_LOGOUT_SETUP.md` → *Verify the registration* before any soak.
2. Human sign-in on `localhost:3000` against production MP on this branch (already registered). Checks: sign-in lands on `/`, sign-out returns to the app, no `auth.userinfo.*` errors in the server log.
3. Merge #237, rebase this PR onto `main`, `/deploy-dev`, and soak at least 24h with a human sign-in and sign-out.
4. Merge, `/deploy`, then port to event-manager → mp-senior-care → music-db, one per business day.
5. After all four have run 1.7 for a week with no rollback: re-record rollback pins, then remove the old `…/oauth2/callback/ministryplatform` entries.

## Follow-ups (out of scope here)

Vitest 5 (now unblocked; ideas.md). better-auth 1.7.6 patch. PKCE retest if an MP admin enables it on TM.Widgets. `cspHeaderName()` default flip (sync log, 2026-09-15).

## Follow-on: sign-out keeps `id_token_hint` after an idle hour (#240) — IN PROGRESS

Found in the review of the upstream MPNext port of our sign-out fix (PR #94), and live here too.

**Bug.** `handleSignOut` finds the ID token through `auth.api.getSession()`. With no database, the server-action bundle's in-memory store is empty, so that call can answer only from the JWT cookie cache (`session_data`, one hour). After an hour with no reload, tab switch or session refetch it returned null, logged `[signout] id_token_hint omitted (no-session)`, and MP left the user on its logged-out page. Sign-out itself still worked.

**Fix.** The user menu calls `authClient.getSession()` immediately before the server action (`refreshSessionCookie`, try/catch, can never block sign-out). `GET /api/auth/get-session` runs in the route handler, whose store holds the session, and re-issues `session_data`; the server-action request that follows carries it. The lookup's catch now also logs `id_token_hint omitted (lookup-failed)`, so a missing `[signout]` line really does mean the hint was sent. `/get-session` was already allowlisted.

**Premise, proven on better-auth 1.7.5 by a harness** (same session options, a real sign-in through the handler): server-action-side `getSession` returns a session at t+59m50s and null at t+60m10s; after `GET /get-session` re-issues the cookie it returns the session again, and the real `createAuthClient().getSession()` end to end turns `no-session` into a sent hint. 1.7.5's check that the cached token equals the `session_token` cookie passes on the re-issued cookie.

**Known limitation, documented not fixed.** `/session-error` signs out a session with no `userGuid` through `<form action={handleSignOut}>`: there is no key to find the token by, so it always goes without the hint and leaves the user on MP's page.

Gates: tsc, eslint 0 problems (0 on base), **912/912 tests in 60 files** (902 in 59 on base: +6 `user-menu.test.tsx`, +3 `actions.test.ts`, +1 `route.flow.test.ts`), `next build`, `check:shells`, `npm audit --audit-level=high` 0. Mutation-checked: removing the refresh call fails the order test; removing its try/catch fails the failed-refresh test; reverting the `lookup-failed` warning fails its test.

Files: `src/components/user-menu/user-menu.tsx`, `user-menu.test.tsx` (new), `actions.ts`, `actions.test.ts`; `src/app/api/auth/[...all]/route.flow.test.ts` (pins that the route re-issues `session_data` from `session_token` alone), `route.ts` (allowlist caller comment); comments in `src/lib/id-token-store.ts` and `src/lib/auth.ts`; `docs/OAUTH_LOGOUT_SETUP.md`, `CLAUDE.md`, `docs/status.md`, `.claude/notes/upstream-sync-log.md`.

**Decision:** upstream's menu also wraps `handleSignOut` in `unstable_rethrow` + `alert` (from upstream #89, defect 3). That is deferred here per the 2026-09-15 sync log and is not part of this fix; the refresh goes in without changing the component's existing behaviour.

**Next:** soak on `:dev` together with #238 — delete only the `session_data` cookie, sign out from the menu, expect to land back on the app with no `[signout]` line in the log. The same change is going to mp-senior-care, event-manager and music-db.

## Outcome (2026-09-25)

- Localhost sign-in against production MP passed (3 sign-ins, session fields, sign-out, `/auth-error`, CSP clean).
- `:dev` production soak: #238 alone from 01:55Z (human sign-in, session, sign-out, `/auth-error` and existing-session checks all passed), then #238 + #240 together from 04:34Z (smoke tests and logs clean — no `auth.userinfo.*`, no `id_token_hint omitted`, no auth 5xx; no separate human check reported on the combined build). Merged at ~11 h (#238) / ~8.5 h (#240) of soak rather than the planned 24 h, at the owner's direction.
- Follow-ups: close-out (after 7 days on 1.7 with no rollback, remove the four `…/api/auth/oauth2/callback/ministryplatform` entries from TM.Widgets and re-record rollback pins); Vitest 5; better-auth 1.7.6 patch.
