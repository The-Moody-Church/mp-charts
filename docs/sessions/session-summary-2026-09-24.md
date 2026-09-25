# Session Summary — 2026-09-24

## Objective

Migrate better-auth 1.6.33 → 1.7.x, starting with mp-charts as the reference for the four apps that share this auth stack (mp-charts, mp-senior-care, event-manager, music-db). Upstream MPNext #68 was tracked as DEFERRED in `.claude/notes/upstream-sync-log.md`.

## Status: IN PROGRESS — code complete and verified; live sign-in and soak outstanding

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
| `chore/better-auth-1.7` (stacked on #237) | the migration | open as draft |

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
