# Session Summary — 2026-11-19

Continuation of the 2026-11-18 session (open items plan, `.claude/plans/open-items-2026-11-18.md`).

## Batch 2 — auth core (#322) — COMPLETED

- **Operator check:** `BETTER_AUTH_URL` is a bare https origin and `MINISTRY_PLATFORM_BASE_URL` is https with the
  `/ministryplatformapi` path in all four TMC1 `.env` files (mp-charts, event-manager, mp-senior-care, music-tools).
  Ironside was unreachable; none of these apps run there.
- **PR #322** (`042a2f5`): CI green (security-lint, verify, build-scan-and-push, CodeQL). Added on top of the batch
  commit: an `/auth-error` test for a one-element array (only the `typeof` guard stops it; fails with the guard
  removed) and the `src/proxy.ts` `originOf` exception sentence in `.claude/rules/security.md`.
- **`:dev` soak** from 13:33 UTC (rollback pin: batch 1 `a10376b` image by digest). Startup clean (no `[env]` or
  `[auth]` lines, cache warm on attempt 1). Live: `/` 307, `/signin` 200; `get-session` 200, unknown `/api/auth`
  path 404 and `POST /sign-in/social` 200, all `Cache-Control: no-store`; `__Secure-better-auth.oauth_state`
  HttpOnly/Secure/SameSite=Lax/Path=/; `/auth-error` drops free text and echoes `state_mismatch`. Owner signed in,
  browsed and signed out back to the app.
- **Merged** as `57f4723`; main build green; **deployed `:latest` 15:43 UTC** (labels `main` / `57f4723`). Cache warm
  on attempt 1; `/` 307, `/signin` 200, `get-session` 200 with `no-store`.

## Batch 2 sibling ports — COMPLETED

event-manager #93 (`6d4700e`), mp-senior-care #254 (`71b0222`), music-tools #210 (`d93172a`), each prepared by a
parallel agent and reviewed here. Differences from mp-charts: `app-url.ts` (event-manager, mp-senior-care) goes through
`getAuthBaseUrl()` with no production-hostname fallback (every caller sits in a notification try/catch);
event-manager's `taskService.resolveTask` validates the MP URL before its reassign write (was `?? ""`); the profile
log uses each repo's `logError` (no `errorForLog` there); music-tools gained `client.ts`/`client-credentials.ts` tests.

All three soaked on `:dev` from 16:01 UTC (rollback pins = the batch 1 images). Live checks matched mp-charts. **Sign-out
finding:** the owner's first sign-out in all four apps (mptools included) landed on MP's `/oauth/account/profile`,
each logging `[signout] id_token_hint omitted (no-mp-account)`. Cause: the session cookie predated the container
restart (cookie cache valid up to 1h), so no sign-in ran in the new process and the in-memory token store and account
row were empty. The known post-restart gap, not a batch 2 regression: the redirect URI is unchanged (all four
`BETTER_AUTH_URL`s are bare origins) and `route.flow.test.ts` pins the token being stored. After a fresh sign-in, sign-out
returned to the app in all four. Merged and `:latest` deployed 16:22 UTC; cache warm, no `[env]`/`[auth]` lines.

**Soak tip:** sign out (or wait out the hour) and sign in fresh after a swap before judging sign-out.

## Next

Batch 3 (MP client) per `.claude/plans/open-items-2026-11-18.md`, then batches 4–10 and the N17 verifier port.
