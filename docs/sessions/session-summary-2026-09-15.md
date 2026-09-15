# Session Summary — 2026-09-15

## Objective

Review the upstream MPNext Better Auth security hardening (PRs #79–#91, merged upstream 2026-09-12/13) and port what applies to this fork and to the two sibling repos copied from it (`mp-senior-care`, `music-db`).

Upstream also published **GHSA-pqxp-c5mr-5398** (High, CVSS 8.1) and a 940-line `docs/security/downstream-hardening-playbook.md` written specifically for downstream forks.

## Status: IN PROGRESS

| Work | Repo | State |
|---|---|---|
| Pin better-auth below 1.7 + Dependabot guard | music-db | **PR #132 open** |
| Identity hardening (F-UPDATE-USER, F2, F7) | mp-charts | **this branch** |
| Identity hardening + 2 IDOR fixes | mp-senior-care | not started |
| Version bump + `input:true` flip + identity hardening + first tests | music-db | not started |
| F4 attribution, F5 logging, error boundaries, F9 CSP | all | deferred to separate PRs |

Full plan, including sequencing and the decisions behind it: `~/.claude/plans/take-a-look-at-fancy-lynx.md`.
Per-PR verdicts for #79–#91: `.claude/notes/upstream-sync-log.md` § Review: 2026-09-15.

## What shipped on this branch

### F-UPDATE-USER (Critical) — session identity was reassignable

`POST /api/auth/update-user` accepts a body of `z.record(z.string(), z.any())`, rejects only `email`, and copies every other key mapping to an `input !== false` additional field verbatim onto the session cookie. Its only gate is `sessionMiddleware`.

**This was live here, and worse than upstream.** Upstream stores one such field (`userGuid`); we store three, so an attacker could also set `mpUserId` (audit attribution on every MP write) and `mpContactId`.

- **Exposure window: 2026-07-10 → today.** Introduced by `71ab6a3`, the better-auth 1.6 repair that flipped the fields to `input: true` — a correct and forced diagnosis, but `input: false` had been implicitly guarding this endpoint and that property was not re-homed.
- Fix: `disabledAuthPaths` → `disabledPaths`, matched in better-auth's router before rate limiting, plugins and `sessionMiddleware`.
- **Mutation-verified**: with `disabledPaths` removed, `/update-user` answers **401** (reachable, session-gated), not 404. Five tests go red.

### F2 (High) — a shared email merged two people onto one identity

Ministry Platform enforces **no uniqueness on email**, and households routinely share one across contacts who each hold a `dp_Users` login. better-auth's OAuth callback falls back to `findUserByEmail` and links the new provider account onto the existing user when both sides are `emailVerified` — and `getMpUserInfo` hardcoded `emailVerified: true`.

Adopted both halves:
- `account.accountLinking.enabled: false`, and `emailVerified: profile.email_verified === true`.
- Root cause: better-auth's `email` is now a synthetic `<sub>@mp.invalid` value (RFC 2606 reserved TLD) via `syntheticEmailForSub`; the real address moved to a new nullable `mpEmail` field; `userGuid` is now `required: true`.

Also changed `getMpUserInfo` to **return `null`** rather than throw on an unusable `sub`. Verified in `node_modules/better-auth/dist/plugins/generic-oauth/routes.mjs`: 1.6 does **not** wrap `getUserInfo` in a try/catch, so our throwing `sanitizeGuid` would have escaped as an unhandled error instead of the clean `user_info_is_missing` redirect a null produces.

`mapProfileToUser` was extracted as the exported, directly testable `mapMpProfileToUser` — reaching it back off the constructed plugin config is brittle.

### F7 — deny-by-default on the better-auth catch-all

better-auth 1.6 mounts ~33 endpoints under `[...all]`; our browser client calls **three**. `allowedAuthRoutes` now refuses everything else with a plain 404 before better-auth is touched, including any endpoint a future version adds.

- Paths are the **1.6** genericOAuth names (`/sign-in/oauth2`, `/oauth2/callback/ministryplatform`), **not** upstream's 1.7 names. The eventual 1.7 migration must update this file in the same commit or sign-in 404s.
- `/sign-out` deliberately excluded — sign-out runs server-side via `auth.api.signOut`.
- New `/auth-error` page replaces better-auth's built-in error page via `onAPIError.errorURL`, mapping **1.6** error codes, never rendering `error_description`, with no auto-redirect. Allowlisted as public in `src/proxy.ts`, or an unauthenticated visit bounces to `/signin`, which auto-starts OAuth and loops.
- **Mutation-verified**: without the allowlist 18 tests go red, and several of those endpoints answer 200 or 401 rather than 404.

## Decisions and their reasoning

1. **Everything applied on the better-auth 1.6 line.** Upstream fixed these on 1.7.4, but every mechanism exists in 1.6 — verified against installed code, not assumed. `release-1.6` is still maintained (1.6.33, 2026-09-14). **The deferred #68 migration is not a prerequisite for any security fix**, which was the main thing worth establishing before starting.
2. **Upstream's F1/F3/F10 role gate deliberately not adopted.** Their premise (reads gated on nothing but a session) does not hold here: `requireFeatureAccess` already gates every contact/PII read by MP User Group, which is stricter than their "any MP security role". Our `getSafeCallbackUrl` likewise already exceeds their F3 fix.
3. **Both endpoint controls kept.** The allowlist is the primary control; `disabledPaths` is defense in depth and is what the tests drive directly against `auth.handler`, bypassing Next routing.

## Gotchas hit

- **The `/auth-error` page failed the build.** `cacheComponents: true` is on, so reading `searchParams` outside a Suspense boundary is an "uncached or runtime data during prerendering" error. Fixed with the repo's documented pattern (`.claude/rules/caching.md` § Suspense & PPR).
- **A trailing slash on an allowed path 404s — from better-auth, not from us.** `/get-session/` normalizes past our allowlist but better-auth then refuses it. Fails closed either way; documented in a test so the next reader does not mistake it for the allowlist misfiring. The tests distinguish the two layers by response body, since ours is `"Not Found"` and better-auth's 404 body is empty.
- **Build output shows `/signin` and `/session-error` as fully static (`○`).** Harmless today, but under the enforced nonce CSP planned for a later PR they would never hydrate — exactly the trap upstream documented. Noted for that PR.

## Files changed

**Modified**: `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts`, `src/proxy.ts`, `src/components/layout/header.tsx`, `src/lib/auth.test.ts`, `src/proxy.test.ts`, `CLAUDE.md`, `.claude/rules/security.md`, `.claude/notes/upstream-sync-log.md`, `docs/status.md`

**Created**: `src/app/auth-error/page.tsx`, `src/app/auth-error/page.test.tsx`, `src/app/api/auth/[...all]/route.test.ts`, this summary

## Verification

- 725 tests / 48 files pass (+61 from main); `npm run lint`, `npx tsc --noEmit` and `npm run build` all clean.
- Both new guards mutation-checked — each fails loudly when the protection is removed.
- No Ministry Platform write of any kind was performed.

## Follow-ups

1. **Deploy requires rotating `BETTER_AUTH_SECRET`** — closing the endpoint does not revoke a session already forged; those survive in the JWT cookie cache for up to an hour, and with no database there is no session table to clear. Then review `dp_Audit_Log` over the 2026-07-10 → deploy window.
2. Port to `mp-senior-care` (exposed since 2026-09-03) and `music-db` (coupled to its version bump).
3. Separate PRs, in this order: F4 attribution → F5 logging + `no-console` → error boundaries and the applicable UI defects → F9 CSP report-only, then enforced.
4. Open decisions still outstanding: CSP enforce timing, and 1.7 migration scheduling across all three repos.
