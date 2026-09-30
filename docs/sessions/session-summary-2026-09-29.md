# Session Summary — 2026-09-29

## Auth hardening

### Objective

Port upstream MPNext's `ea2e0ad..75d249d` auth work (PRs #96, #97) to this fork, adapted to our explicit-endpoint provider, and fix the sign-out revocation gap it exposed here.

### Status: PR [#244](https://github.com/The-Moody-Church/mp-charts/pull/244) open from `fix/auth-hardening`, not merged. Needs a `:dev` soak with a human sign-in and sign-out before it ships

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
| 6 | `assertAuthEnvironment` (unset/empty, default, < 32 chars, `BETTER_AUTH_SECRETS`, `TEST` in production, `TEST=0` included; no `NEXTAUTH_SECRET` fallback; `next build` exempt); `disableOriginCheck: false`; test secret ≥ 32 chars | `fd7fc4a` |
| 7 | `client_id` on the end-session URL, with and without `id_token_hint` | `10ef3df` |
| 8 | `/link-social` disabled; sanitizer, Content-Type and in-process `signInSocial` tests from the 2026-09-28 comparison | — |
| 9 | Docs: CLAUDE.md, `.claude/rules/security.md` (sessions section, GHSA erratum, guard, limiter), `.env.example`, README, `docs/OAUTH_LOGOUT_SETUP.md`, upstream sync log | — |

Plus one test-only follow-up commit (a tsc cast in the decision-3 test), three review follow-up commits (`7f63a2d`, `353fb75`, `94fa667`; docs in `3c841a0` and the commit after `94fa667`), and one lockfile-only dependency commit (`c5e2ed6`, below the table):

| Finding | Fix |
|---|---|
| `AUTH_TRUSTED_PROXIES` check accepted entries better-auth's own parser drops with a warning (`fe80::1%lo0`, `fe80::1%eth0/64`, `::ffff:10.0.0.0/104`, `::ffff:1.2.3.4/120`) | Also refuse whatever `findInvalidTrustedProxies` (`@better-auth/core/utils/ip`) rejects; tests incl. a negative control that better-auth only warns |
| No test proved the real `auth` reads the IP env vars (`ipAddress: {}` left the suite green) | Hoisted env in `auth.rate-limit.test.ts`; the real instance's parsed options are pinned |
| One-warning assertion depended on test order (failed with `--sequence.shuffle`, seeds 3 and 7) | Counted across the file; 28/28 with seeds 1, 3, 7, 11, 42, 99, 123, 555, 2026, 31337 |
| Content-Type pin used `trim()`, which strips U+00A0/VT/FF: `\u00a0application/json` reached better-auth (400, or a logged 500) | Anchored `/^application\/json[ \t]*(?:;|$)/`; route tests with `auth.handler` never called |
| A deep link over ~2 KB now 404'd at `/sign-in/social` → `/auth-error` | `src/lib/auth-callback-url.ts`; `getSafeCallbackUrl` sends `/` for a longer result (at 1536 since `94fa667` — next row) |
| The page's limit was the 2048 server cap, which does not fit in a cookie: better-auth's hex-encoded `oauth_state` value is 556 + 2 × length bytes, so past 1754 characters (with the production `__Secure-` name) the browser dropped it and the MP callback ended on `/auth-error?error=state_mismatch`. Not a regression — every callback over ~1.75k characters failed that way before this branch. Found by the event-manager and music-db ports | `94fa667`: `MAX_SIGN_IN_CALLBACK_URL_LENGTH` = 1536 for `getSafeCallbackUrl`; `MAX_CALLBACK_URL_LENGTH` (2048, the route filter) unchanged; `route.test.ts` measures the real cookie at both. Matches event-manager #54 |
| "Invalid entries refuse startup" was wrong (lazy load: 500s, container up) | `.env.example`, `auth.ts` comment, security.md, CLAUDE.md, README |
| Sync log listed #98 though it was not reviewed (the review command would skip it) | Entry is `ea2e0ad..75d249d` (#96, #97); `f1ad0c8` recorded as not yet reviewed |
| Logout-doc status row overstated the fix | Token dies at sign-out; a copied pair lasts at most the rest of its 1 h cache |

**Dependency (`c5e2ed6`):** `npm audit --audit-level=high` started failing after the branch's CI run, on an unchanged lockfile: ten undici advisories fixed in 7.29.1, two of them high (GHSA-rfgv-xxqx-mfg5, GHSA-w293-vg96-wgc3), published 2026-09-29. undici comes only through jsdom (the Vitest environment) and is not in the standalone image, but the audit gates every deploy, `main` included. `npm audit fix` with CI's npm 11.19.0: undici 7.29.0 → 7.30.0, lockfile only.

**Parity with the ports (`b182611`):** a four-way comparison against event-manager, mp-senior-care and music-db found three places where this repo, the source of truth, had fallen behind them. The code was already identical; comments, docs and one test changed.

| Finding | Fix |
|---|---|
| `readBodyWithLimit` said an over-cap body "is never buffered past the cap", and the filter docblock "refused before anything is cloned or read". Wrong: `src/proxy.ts` matches `/api/auth`, so Next 16.3.4 (`getCloneableBody`, `next/dist/server/body-streams.js`) has already read the whole body, up to its 10 MB proxy clone limit, and waited for it to end, before the route runs | Both docblocks now say the 4096-byte cap bounds what the filter parses and better-auth receives, not what the server buffers; CLAUDE.md and the sync log record it as the separate proxy body-size item (below). Code unchanged |
| The Content-Type comments said a repeated header "arrives here comma-joined". Node's parser keeps the first line and drops the rest, so the filter and better-call read the same value; the `,` check covers Fetch Headers and merging intermediaries | `route.ts` and `route.test.ts` comments now match event-manager's |
| The guard refuses `TEST=0` (better-auth's `toBoolean` is `val !== "false"`), but only music-db pinned it, and our docs said "a truthy `TEST`", which reads as if `TEST=0` were safe | `auth.secret-guard.test.ts` adds `"0"`; `.env.example`, CLAUDE.md and security.md name the safe spellings; a pre-deploy check in Follow-ups |

### Evidence

- Unit/integration: 918 → 1035 tests, 60 → 65 files, all green; tsc clean; lint 0 errors/0 warnings; `npm audit --audit-level=high` exit 0, 0 vulnerabilities (after `c5e2ed6`; without it, exit 1 on the undici advisories above); clean `next build` with no env; `check:shells` 19 shells OK; security-lint grep clean.
- Every decision was mutation-checked: reverted, the new tests went red, restored byte-identical (sha256). The review follow-ups too: `ipAddress: {}` → 1 failed (it passed all 1013 before); dropping `findInvalidTrustedProxies` → 5 failed; the old `trim()` pin → 5 failed; no client-side cap → 3 failed (2 files). The `94fa667` sign-in limit (all restored byte-identical, sha256): the page reading the 2048 cap again → 4 failed (2 files); a page limit of 1537 or 1535, or `>=` for `>` → 2 failed each; the route filter reading the page limit → 2 failed; the server cap at 1536 → 3, at 2049 → 2; a page limit of 1755 → the real-cookie test red (`expected 4098 to be less than or equal to 4096`), 1754 green.
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
  - re-run on the branch's code before `94fa667` (which changes only what the sign-in page sends): all three NBSP Content-Types 404 (ASCII-space and `; charset=utf-8` controls 200); `callbackURL` of 2048 chars 200, 2049 and 3000 404; each of `fe80::1%lo0`, `::ffff:10.0.0.0/104`, `fe80::1%eth0/64`, `::ffff:1.2.3.4/120` → get-session 500 ×2 with the `[auth]` line, process still listening
- `94fa667` sign-in limit, measured on this repo:
  - `oauth_state` value on the real handler (Vitest): exactly 556 + 2 × length bytes at 1, 5, 100, 1000, 1536, 1742, 1754, 1755 and 2048 characters — the same as event-manager's. With the production name (32 bytes): 3660 at 1536, 4096 at 1754, 4098 at 1755, 4684 at 2048
  - Chromium (headless, Playwright) on a local production build of `94fa667`, fake MP on localhost. The build is served over http, so the cookie is `better-auth.oauth_state` (23 bytes) and the limit falls between 1758 and 1759. A `callbackURL` POSTed straight to `/sign-in/social` (what the page used to send for anything up to 2048): 1536 → 3651 B, stored, signed in, landed on the deep link; 1758 → 4095 B, the same; 1759 → 4097 B and 2048 → 4675 B, **not stored**, ended on `/auth-error?error=state_mismatch` with no session (server log: two `State mismatch: auth state cookie not found`). Through the real `/signin?callbackUrl=` page: a 1536-character deep link was sent as-is and landed on itself; 1537, 1758, 2048 and 3000 were sent as `/`, signed in and landed on `/`
- `b182611` parity, measured on this repo:
  - `TEST=0` pin: a guard that also let `"0"` through fails exactly `refuses TEST=0 on a production process` (1 failed); `auth.ts` restored byte-identical (sha256)
  - Node 24.21.0 (the production runtime) and 26.8.2, raw socket with two `Content-Type` lines: `req.headers` holds only the first, `application/json`. Next builds route-handler headers from `req.headers` (`fromNodeOutgoingHttpHeaders`)
  - Local standalone build of `b182611` on Node 24, fake MP base URL on a closed local port, raw sockets to `/api/auth/sign-in/social`: control 200; `Content-Type` json then form 200, form then json 404, comma-joined 404; 20 concurrent 9 MB bodies (declared Content-Length) all 404, RSS 145 → 274 MB (+130 MB); a body stalled short of its Content-Length got no response in 4 s whether that Content-Length was over the cap (100000) or under it (100). Next does not change Node's 300 s `requestTimeout`. Control 200 again afterwards

### Decisions and why

- **Keep the id-token store and `refreshSessionCookie()`** — both now backups (the store is still the primary hint source; the refresh is no longer required).
- **`client_id` is not the fix for the logout redirect** — on 2026-09-22 MP ignored `post_logout_redirect_uri` with `client_id` and no hint. Sent for spec conformance and upstream parity; the hint stays load-bearing.
- **Two callback limits, not one** (`src/lib/auth-callback-url.ts`): the route filter keeps upstream's 2048 as the size-DoS cap, and the sign-in page sends `/` above 1536. The page's limit has to fit the `oauth_state` cookie (≤ 1754 with the production name); 1536 leaves 436 bytes of headroom should a better-auth release grow the state payload, and `route.test.ts` goes red if it stops fitting. Lowering the server cap to match was not needed: a direct POST of 1755–2048 characters only fails that caller's own sign-in.
- **Secret guard exempts only `next build`**, not Vitest (the test setup supplies a valid secret). A secretless `next build` still logs better-auth "default secret" errors during page-data collection; the same happens on `main` (16 lines there, 15 here).

### What users will notice after deploy

Every active user goes back through sign-in within 1 h of the deploy (a silent redirect while their MP session is alive), and at least every 12 h afterwards. Server components and actions see the session after the cookie cache lapses, so there should be fewer spurious `/signin` bounces. A signed-out user following a deep link longer than 1536 characters signs in and lands on `/` (above ~1754 that used to end on `/auth-error`).

### Follow-ups

- Soak #244 on `:dev` with a human sign-in/sign-out, then merge. Until it merges, `main`'s `npm audit` gate fails on undici (fixed here by `c5e2ed6`); if the soak is long, land that lockfile change on `main` separately first.
- **Operator, before promoting `:dev` (read-only):** grep the app's `.env` for a line starting `TEST=`. Only none, an empty `TEST=`, or exactly `TEST=false` is safe; any other value, `TEST=0` included, makes every auth request return 500 with the `[auth] TEST is set …` line.
- **Operator, after deploy:** set `AUTH_IP_ADDRESS_HEADERS=cf-connecting-ip` in the app's `.env` (not needed for the fix itself).
- **Not in this change, the proxy body-size item:** `src/proxy.ts` matches `/api/auth`, so Next reads up to 10 MB of any request body (its default proxy clone limit; `proxyClientMaxBodySize` is not set), and waits for it to end, before the 4096-byte filter and the rate limiter run. An anonymous caller can make the server hold that much per request, and a stalled body holds its request open until Node's request timeout. Fixing it needs its own review: narrowing the proxy matcher takes `/api/auth` responses out of the proxy's CSP header, and a lower `proxyClientMaxBodySize` truncates (does not refuse) every proxied body, the server-action photo uploads (20 MB limit) included.
- Port the same change to event-manager, mp-senior-care and music-db (same branch name).
- The GHSA-pqxp-c5mr-5398 exposure window is corrected in `.claude/rules/security.md`: up to 7 days, self-renewing, on the pre-2026-09-29 config.
