# Session Summary — 2026-11-08

## Objectives
1. better-auth 1.7.14 → 1.7.18 in mp-charts first, then the three siblings (owner's call: this before the
   Dependabot triage and the queued items).
2. Then triage the Dependabot PRs that arrived 2026-11-03..08.

## better-auth advisories of 2026-11-03 — none reach us

better-auth published 12 advisories on 2026-11-03, all fixed in 1.7.16 (npm `latest` is 1.7.18; Dependabot
#292 offered only 1.7.15). Checked each against our config, in all four apps:
- **GHSA-9hm7-xhfp-cx58** (unverified provider email treated as verified): we set
  `emailVerified: profile.email_verified === true`, `accountLinking: { enabled: false }`, no `discoveryUrl`
  (so no JWKS), and `getUserInfo` already cross-checks the id_token and userinfo `sub`. Not affected.
- **GHSA-fvxx-76fc-893x** (revoked sessions staying valid): needs `secondaryStorage`, or the cookie cache
  with passkey, device authorization or two-factor enrollment. We have none of those. Not affected.
- The other ten are in the phone-number, admin, organization, email-OTP, change-email, Expo, Electron,
  Stripe, passkey and Kysely/Drizzle code: none installed or reachable (the allowlist 404s everything but
  three routes).
- The nightly audit passed in all four repos through 2026-11-08: these are repo advisories that npm audit
  does not report, so the deploy gate was never at risk.

## mp-charts: better-auth 1.7.18 — IN PROGRESS (PR open)

Branch `chore/better-auth-1.7.18`.
- **Packages:** better-auth, `@better-auth/core` and the adapters/telemetry 1.7.14 → 1.7.18, `better-call`
  1.4.4 → 1.4.5, `@better-auth/utils` unchanged at 0.5.1. `npm install` wrote `^1.7.18`; put back to
  `>=1.7.18 <1.8.0`.
- **Release notes 1.7.15–1.7.18:** the 1.7.16 security batch above, plus fixes in plugins we don't use. The
  ones near our code: non-returning `hooks.before` headers are now merged (ours throws), `BETTER_AUTH_SECRETS`
  errors no longer echo the entry (we refuse that variable outright), built-in social providers stop
  following redirects (generic OAuth uses its own token request).
- **Dist diff 1.7.14 vs 1.7.18 of the auth-relevant files:**
  - `plugins/generic-oauth`: `emailVerified` goes through `toBoolean`, and a new id_token `sub` check runs
    only when the provider has `idToken` config (discovery/JWKS). We have none, so the callback calls our
    `getUserInfo` exactly as before. Our explicit `accountSubject` still wins over the new default.
  - `api/routes/sign-in.mjs`: the ID-token branch now uses `getUserInfoFromIdToken` (refused three ways).
  - `oauth2/link-account.mjs`, `api/routes/account.mjs`, `state.mjs`: link-session binding; linking is
    disabled and `/link-social` closed.
  - `better-call`: request Content-Type must now equal an allowed type (was a substring match). Stricter,
    and our filter already pins exactly `application/json`.
  - `api/routes/callback.mjs`, `oauth2/callback.mjs`, `oauth2/state.mjs`, the rate limiter and `session.mjs`:
    unchanged. `oauth2/errors.mjs`: byte-identical.
- **Re-verified on 1.7.18:** 30 mounted endpoints at runtime (no route files added or removed);
  `getUserInfo` still not wrapped in a try/catch (now `dist/oauth2/callback.mjs:39`; the comments named
  `api/routes/callback.mjs:122`, stale since 1.7.14's refactor, fixed); `oauth_state` still exactly
  556 + 2 × length (1536 → 3628 bytes, 2048 → 4652). Every "1.7.14" claim in code comments, CLAUDE.md and
  security.md updated after its check.
- **Checks:** `npm audit signatures`: 0 invalid, 0 missing; the five updated packages carry SLSA provenance.
  tsc, lint, 1208 tests, the audit gate and `npm run build` pass.
- **Next:** soak on `:dev` with an owner sign-in and sign-out, then merge and deploy; then port to
  mp-senior-care, event-manager and music-tools.

## Files
- **Modified (branch):** `package.json`, `package-lock.json`, `CLAUDE.md`, `.claude/rules/security.md`,
  `src/lib/auth.ts`, `src/lib/auth.test.ts`, `src/lib/auth-callback-url.ts`, `src/app/auth-error/page.tsx`,
  `src/app/api/auth/[...all]/route.ts`, `src/app/api/auth/[...all]/route.test.ts`, `docs/status.md`
- **Created:** this summary
