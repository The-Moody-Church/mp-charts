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

## Next

Port batch 2 to event-manager, mp-senior-care and music-tools (route `lib/app-url.ts` through `getAuthBaseUrl` in
event-manager and mp-senior-care, or document its production fallback). Then batches 3–10 and the N17 verifier port.
