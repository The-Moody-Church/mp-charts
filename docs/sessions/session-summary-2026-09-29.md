# Session Summary — 2026-09-29

## Auth hardening

### Objective

Port upstream MPNext's `ea2e0ad..75d249d` auth work (PRs #96, #97) to this fork, adapted to our explicit-endpoint provider, and fix the sign-out revocation gap it exposed here.

### Status: PR open from `fix/auth-hardening`, not merged. Needs a `:dev` soak with a human sign-in and sign-out before it ships

### The finding

**Sign-out did not revoke a copied session.** Next loads `src/lib/auth.ts` once per bundle layer — two copies on our standalone production build (route handler; server components + actions). Each copy built its own `betterAuth()` with its own in-memory store, so the OAuth callback wrote the session in one and `handleSignOut` deleted it from the other. Measured on a local production build against a fake MP (before the fix): a `session_token` copied before sign-out was still valid afterwards and still valid 13 h later; the pre-fix negative control in `auth.session-lifetime.test.ts` shows it still valid 30 days on, its `expiresAt` sliding forward daily, i.e. until the process restarts.

### Done (one commit per decision group)

| # | Change | Upstream |
|---|---|---|
| 1 | `createAuth()` + `sharedInstance(Symbol.for("tmc.auth"), createAuth)`: one `auth` per process on `globalThis` (Vitest exempt) | `0e2652e` |
| 2 | Sessions: `expiresIn` 12 h, `disableSessionRefresh`, `cookieCache` 1 h JWT with explicit `refreshCache: false` (named constants) | `fd7fc4a` |
| 3 | `storeAccountCookie: false`; `databaseHooks.account` strip access/refresh tokens + expiries (idToken kept) | `a424953` |
| 4 | `/sign-in/social` body ≤ 4096 bytes (Content-Length + streamed read), `callbackURL` a string ≤ 2048 chars; our exact-`application/json` pin kept | `48a871b` |
| 5 | `AUTH_IP_ADDRESS_HEADERS` / `AUTH_TRUSTED_PROXIES` → `advanced.ipAddress`; `rateLimit.customRules` `/sign-in/social` 10 per 10 s (ours) | `0f61f54` |
| 6 | `assertAuthEnvironment` (unset/empty, default, < 32 chars, `BETTER_AUTH_SECRETS`, `TEST` in production; no `NEXTAUTH_SECRET` fallback; `next build` exempt); `disableOriginCheck: false`; test secret ≥ 32 chars | `fd7fc4a` |
| 7 | `client_id` on the end-session URL, with and without `id_token_hint` | `10ef3df` |
| 8 | `/link-social` disabled; sanitizer, Content-Type and in-process `signInSocial` tests from the 2026-09-28 comparison | — |
| 9 | Docs: CLAUDE.md, `.claude/rules/security.md` (sessions section, GHSA erratum, guard, limiter), `.env.example`, README, `docs/OAUTH_LOGOUT_SETUP.md`, upstream sync log | — |

Plus one test-only follow-up commit (a tsc cast in the decision-3 test), and two review follow-up commits:

| Finding | Fix |
|---|---|
| `AUTH_TRUSTED_PROXIES` check accepted entries better-auth's own parser drops with a warning (`fe80::1%lo0`, `fe80::1%eth0/64`, `::ffff:10.0.0.0/104`, `::ffff:1.2.3.4/120`) | Also refuse whatever `findInvalidTrustedProxies` (`@better-auth/core/utils/ip`) rejects; tests incl. a negative control that better-auth only warns |
| No test proved the real `auth` reads the IP env vars (`ipAddress: {}` left the suite green) | Hoisted env in `auth.rate-limit.test.ts`; the real instance's parsed options are pinned |
| One-warning assertion depended on test order (failed with `--sequence.shuffle`, seeds 3 and 7) | Counted across the file; 9 seeds pass |
| Content-Type pin used `trim()`, which strips U+00A0/VT/FF: `\u00a0application/json` reached better-auth (400, or a logged 500) | Anchored `/^application\/json[ \t]*(?:;|$)/`; route tests with `auth.handler` never called |
| A deep link over ~2 KB now 404'd at `/sign-in/social` → `/auth-error` | `MAX_CALLBACK_URL_LENGTH` in `src/lib/auth-callback-url.ts`, shared; `getSafeCallbackUrl` sends `/` for a longer result |
| "Invalid entries refuse startup" was wrong (lazy load: 500s, container up) | `.env.example`, `auth.ts` comment, security.md, CLAUDE.md, README |
| Sync log listed #98 though it was not reviewed (the review command would skip it) | Entry is `ea2e0ad..75d249d` (#96, #97); `f1ad0c8` recorded as not yet reviewed |
| Logout-doc status row overstated the fix | Token dies at sign-out; a copied pair lasts at most the rest of its 1 h cache |

### Evidence

- Unit/integration: 918 → 1029 tests, 60 → 65 files, all green; tsc clean; lint 0 errors/0 warnings; `npm audit --audit-level=high` exit 0 (1 moderate, undici, lockfile unchanged); clean `next build` with no env; `check:shells` 19 shells OK; security-lint grep clean.
- Every decision was mutation-checked: reverted, the new tests went red, restored byte-identical (sha256). The review follow-ups too: `ipAddress: {}` → 1 failed (it passed all 1013 before); dropping `findInvalidTrustedProxies` → 5 failed; the old `trim()` pin → 5 failed; no client-side cap → 2 failed.
- Production-build harness (fake MP on localhost, fake clock), **after** the fix:
  - sign-in sets `session_token` + `session_data` only (no `account_data`); `expiresAt` = sign-in + 12 h
  - sign-out → end-session URL has `client_id`, `id_token_hint`, `post_logout_redirect_uri`
  - copied `session_token` alone: dead at sign-out (t+0), t+61 min and t+13 h
  - copied `session_token` + `session_data` pair: valid until its cookie cache lapses (t+50 min), not re-minted, dead at t+61 min
  - sign-out with no cookie refresh after the cache lapsed (t+61 min) and at t+11 h 59 m: hint still sent, copy dead
  - `/home` with `session_token` only renders like the full pair (before: redirected to `/signin`)
  - restart: the browser's own pair lasts until its cache lapses (t+50 PRESENT, t+61 null)
  - rate limiter: 10 × 200 then 429 per client; with `AUTH_IP_ADDRESS_HEADERS=cf-connecting-ip` and the header missing, one shared bucket and one `Rate limiting could not determine a client IP` warning
  - a short secret, `TEST=1`, or an invalid `AUTH_TRUSTED_PROXIES` → the first auth request returns 500 with an `[auth] …` log line; the process stays up (Next loads route modules lazily)
- Review follow-ups, raw-socket probes on local production builds (before = `a0f746a`, after = this branch):
  - `\u00a0application/json; x=application/x-www-form-urlencoded` with an allowed body: before 500 + `ERROR [Better Auth]: TypeError: Content-Type was not one of "multipart/form-data" …`; after 404, no log line
  - `\u00a0application/json`: before 400 `VALIDATION_ERROR`; after 404. Plain `application/json` control: 200 on both
  - `AUTH_TRUSTED_PROXIES=fe80::1%lo0` or `::ffff:10.0.0.0/104`: before get-session 200 + `Ignoring invalid advanced.ipAddress.trustedProxies entries`; after 500 ×2 with the `[auth] AUTH_TRUSTED_PROXIES …` line, process still listening. `10.0.0.0/24` + `cf-connecting-ip`: 200
  - browser (Playwright) on `/signin?callbackUrl=` + a 3000-char deep link: completed sign-in against the fake MP and landed on `/`; a direct 3000-char `callbackURL` POST still 404s

### Decisions and why

- **Keep the id-token store and `refreshSessionCookie()`** — both now backups (the store is still the primary hint source; the refresh is no longer required).
- **`client_id` is not the fix for the logout redirect** — on 2026-09-22 MP ignored `post_logout_redirect_uri` with `client_id` and no hint. Sent for spec conformance and upstream parity; the hint stays load-bearing.
- **Secret guard exempts only `next build`**, not Vitest (the test setup supplies a valid secret). A secretless `next build` still logs better-auth "default secret" errors during page-data collection; the same happens on `main` (16 lines there, 15 here).

### What users will notice after deploy

Every active user goes back through sign-in within 1 h of the deploy (a silent redirect while their MP session is alive), and at least every 12 h afterwards. Server components and actions see the session after the cookie cache lapses, so there should be fewer spurious `/signin` bounces.

### Follow-ups

- Soak the PR on `:dev` with a human sign-in/sign-out, then merge.
- **Operator, after deploy:** set `AUTH_IP_ADDRESS_HEADERS=cf-connecting-ip` in the app's `.env` (not needed for the fix itself).
- Port the same change to event-manager, mp-senior-care and music-db (same branch name).
- The GHSA-pqxp-c5mr-5398 exposure window is corrected in `.claude/rules/security.md`: up to 7 days, self-renewing, on the pre-2026-09-29 config.
