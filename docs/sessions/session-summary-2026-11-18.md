# Session Summary — 2026-11-18

Continues 2026-11-17's session (see `session-summary-2026-11-17.md`).

## Dashboard fix deployed — COMPLETED (#310)

- Owner approved the `:dev` soak ("merge and deploy"). #310 merged (`079aea0`); main CI green (security-lint, verify,
  build-scan-and-push); `:latest` deployed to TMC1 15:21 UTC, labels `branch: main`, `sha: 079aea0`. Cache warming
  succeeded on attempt 1; 307 → `/signin` 200. The pre-soak rollback pin in `/srv/mpcharts/docker-compose.rollback.yml`
  is unchanged.

## Admin tool actions and the ministry year — COMPLETED (#319)

The two low ideas.md entries left from #302's test findings.

- **#307, admin tool actions** (`src/components/admin/{journey,compliance}-tools/actions.ts`, save and delete in both):
  `enforceRateLimit(session.user.id, "write")` after the admin check; save persists `validate*ToolConfig`'s parsed
  value, so keys outside the schema are stripped; the processing-service `clearCache` moved to straight after the
  config write, before the feature-access step (it used to be skipped when that step threw). Kept parallel per
  ui-standards.md.
- **#308, ministry year**: `getDashboardRange()` (`src/components/dashboard/dashboard-range.ts`) reads the month via
  `mpMonthKey` (Central), so the rollover is midnight Central on Sep 1 in any process zone. The browser default
  (`date-range-filter.tsx`) stays on the viewer's calendar. The ideas.md note's "default view jumps to the empty new
  year" was wrong: the default selection comes from the browser copy.
- Tests: compliance's three `it.fails` are plain tests now; journey's "current behaviour" smuggled-key test inverted;
  cache-order and rate-limit refusal tests in both files. 14 fail on the old actions (checked by swapping them in).
  `dashboard-range.test.ts` uses explicit instants and runs the rollover under UTC, Chicago, Tokyo, Auckland and
  Los Angeles; 6 of 9 fail on the old helper under UTC.
- Checks: tsc, lint, 1860 tests (UTC and Central), coverage 59.46/50.32/50.6/60.69 (floors hold), audit gate.
- Docs: ideas.md entries linked to #307/#308 and COMPLETED; testing.md notes no `it.fails` remain; status.md row.
- The ideas.md sync had opened each entry twice (#307/#317, #308/#318) because the entries carried no issue link.
  #317 and #318 closed as duplicates.
- PR #319: CI green (security-lint, verify, build-scan-and-push, CodeQL). Owner approved "merge and deploy" 2026-11-18.
- Merged as #319 (`3ae528c`); main CI green; `:latest` deployed to TMC1 15:54 UTC (labels `branch: main`,
  `sha: 3ae528c`), cache warming on attempt 1, 307 → `/signin` 200. The sync closed #307 and #308.

## Follow-ups

- picomatch: when GHSA-fc5q-39xc-vjpf has a patched release, take it and drop the allow-list entry (and its
  `production_via_optional_peer`) in all four repos; the entry's review_by is 2026-12-17.
- Still open from earlier: #297 (page paths get the proxy's 10 MB body copy), audit LOW items N9–N19, the upstream
  MPNext review (`75d249d..aa1bc64` not yet logged).
- First session ended 2026-11-18.

## Later session (2026-11-18): open items review — IN PROGRESS

Picked up the older open items: #297, audit LOW findings N9–N19, and the unlogged upstream MPNext range
`75d249d..aa1bc64`. Most of that upstream range is where N9–N19 came from, so they were reviewed together.

- **Analysis** (read-only workflow, 10 analysts + critic): 50 entries with file:line evidence, measurements and
  proposed changes in `.claude/plans/open-items-2026-11-18.md`. The critic refuted one side claim (orphan
  `'use server'` exports are not in the current action manifest, so they are latent, not live).
- **Owner decisions:** N17 port the lazy id_token verifier to all four apps; keep silent re-sign-in (skip
  `/signed-out`); N16 `jwe` + strip `/get-session` token/IP/UA; add an MIT LICENSE; future audits stay in the repo.
- **Batch 0 (docs):** upstream-sync-log entry for the range; audit table (N8 reviewed, N11 partly fixed, N15
  confirmed fixed, N16/N17 decisions); #297 closed as accepted with the measurements; CLAUDE.md and security.md
  #297 lines; MIT `LICENSE` (keeps MPNext's notice) and README's License section.
- New finding not in the audit: `ContactService.updateContact` lets caller fields override `Contact_ID` (no
  callers; same in event-manager and mp-senior-care). Batch 4 deletes it.
- **Next:** batch 1 (N9 proxy matcher anchoring, N13 `originOf`, N14 next.config, `base-uri 'none'`), mp-charts
  first, then the three sibling repos after a `:dev` soak.

### Batch 1 — headers and proxy (N9, N13, N14) — COMPLETED (PR #320)

Branch `security/batch1-headers-proxy`.
- `src/proxy.ts`: `/api` public only as `/api` or `/api/...`; matcher exclusions bounded (`_next/static/`,
  `_next/image(?:$|/)`, `favicon\.ico$`, `manifest\.json$`, `sw\.js$`, `offline\.html$`). `/api/auth` stays
  excluded and the `next-action` skip stays (upstream 9b61b82's string would have dropped both).
- `src/lib/security-headers.ts`: `originOf` refuses non-http(s) schemes and hostnames outside `[a-z0-9.-]`;
  `base-uri 'none'`.
- `next.config.ts`: `poweredByHeader: false`, `images: { unoptimized: true }`, `logging: { serverFunctions: false }`;
  `REVIEWED_OPTIONS` updated.
- Tests: `src/lib/next-config.test.ts` (new; also pins COOP/CORP, which no test covered), near-miss matcher paths
  and `/apidocs` in `src/proxy.test.ts` (tautological inline-regex tests removed), `originOf` refusals. 25 of the
  new tests fail on the old source.
- `.claude/worktrees/` ignored in git and eslint (upstream #104).
- Checks: tsc, lint, 1886 tests, build, `check:shells`, `check:standalone`, audit gate.
- **Found on the way:** GHSA-fc5q-39xc-vjpf (picomatch) was **withdrawn** 2026-11-18 15:38 UTC. The gate now warns the
  allow-list entry is stale; remove it (and `production_via_optional_peer`) in all four repos as its own change.
- PR #320: CI green; independent three-lens review on a standalone build found no defects. Soaked on `:dev`
  (`e059fca`) 18:13 UTC: production smoke showed CSP `base-uri 'none'` with the MP origin kept, no `X-Powered-By`,
  `/_next/image` 404, `/sw.jsx` 307, `/sw.js` 200; owner signed in and approved. Merged as `a10376b`; main CI green;
  `:latest` deployed to TMC1 18:42 UTC (labels `branch: main`, `sha: a10376b`), cache warming on attempt 1,
  `/` 307, `/signin` 200.
- **Next:** port batch 1 to event-manager, mp-senior-care and music-db; then batch 2 (auth core). Separately, drop
  the withdrawn picomatch allow-list entry in all four repos.

### Withdrawn picomatch allow-list entry — COMPLETED (mp-charts #321, event-manager #91, mp-senior-care #252, music-tools #208)

Branch `chore/drop-withdrawn-picomatch-entry`. GitHub withdrew GHSA-fc5q-39xc-vjpf at 2026-11-18 15:38 UTC
(`gh api /advisories/GHSA-fc5q-39xc-vjpf` → `withdrawn_at`), and the gate warned the entry was stale.
- `scripts/audit-allowlist.json` is `[]`. `scripts/audit-gate-lib.test.ts`: the committed list may not contain the
  picomatch id, and no entry may carry `production_via_optional_peer` (the old pin required exactly that entry).
  The gate's optional-peer support and the picomatch/extglob guards in `src/test-only-imports.test.ts` stay.
- Docs: CLAUDE.md (Node Runtime), `.claude/rules/security.md` ("Current entries: none"; the vendored-picomatch guard kept), status.md, and the `src/test-only-imports.test.ts` header comment.
- Checks: gate `0 stale`, tsc, lint, 1885 tests.
- Same change going to event-manager, mp-senior-care and music-tools (the three gate files stay byte-identical).
- All four merged 2026-11-18 after green CI (mp-charts `1d03423`). No runtime change, so no deploy needed; the
  next deploy of each app carries it.

### Batch 1 ports — COMPLETED (event-manager #92, mp-senior-care #253, music-tools #209)

Ported by one agent per repo, each checked by an independent reviewer against `e059fca` (no defects; one stale
CLAUDE.md sentence fixed on event-manager's picomatch branch). Per repo: matcher and `/api` bounded, `originOf`,
`base-uri 'none'`, COOP/CORP (new to all three), `next-config.test.ts`. next.config: event-manager adds
`poweredByHeader` + `logging` (already `unoptimized`); mp-senior-care adds all three; music-tools swaps
`remotePatterns` for `unoptimized` and adds `logging` (and keeps no `next-action` skip). New tests failing on the
old source: 26 / 27 / 21. CI green on all three. Each branch merged in its picomatch branch to resolve doc-row
conflicts. event-manager and music-tools status.md pruned to 7 days per their rules.
- Soaked on `:dev` together at 20:23 UTC (rollback pins written first). Live checks on all three: CSP
  `base-uri 'none'` with MP origin kept, COOP/CORP, no `X-Powered-By`, `/_next/image` 404, `/apidocs` 307, PWA files
  200 and `/sw.jsx` 307. Owner signed in and out on each and approved. Merged (`223056f`, `d15321d`, `753c71e`), main
  CI green, `:latest` deployed 20:50 UTC (labels `branch: main`); cache warming attempt 1 on event-manager and
  mp-senior-care; music-tools pulled the app service only, neon-backup untouched. Each repo's own docs recorded on main.
- GitHub left a Dependabot alert open for the withdrawn advisory in event-manager (#4) and music-tools (#156),
  development scope; it is not an npm audit finding.
- **Next:** batch 2 (auth core), per `.claude/plans/open-items-2026-11-18.md`.

### Batch 2 — auth core (N19, f2af96d userinfo, 721d6e5/5620831, 6167cfd, 6aa1633, aa696f8) — COMPLETED (merged #322, deployed 2026-11-19; see session-summary-2026-11-19.md)

Branch `security/batch2-auth-core` from `1f9fa24`. One commit, no push, no PR yet. No pinned setting changed
(`pkce: false`, no `discoveryUrl`, providerId `ministryplatform`, session/cookieCache, `allowedAuthRoutes`,
`disabledAuthPaths`, `input: true`, `/api/auth` outside the proxy).

1. **N19** — new `src/lib/env.ts` (`getMpBaseUrl`, `getAuthBaseUrl`; upstream 6616310 + 2227a80). No `NEXTAUTH_URL`
   fallback; loopback http allowed for `BETTER_AUTH_URL` even in production; MP URL https only (loopback outside
   production), path kept; auth URL a bare origin, trailing slash stripped; credentials/query/fragment refused;
   messages never echo the value. `auth.ts` reads both after `assertAuthEnvironment`, under the same
   `NEXT_PHASE=phase-production-build` exemption (`BUILD_PHASE_PLACEHOLDER_ORIGIN` during the build only).
   `handleSignOut` (no localhost `post_logout_redirect_uri`), `client.ts` and `client-credentials.ts` lose their `!`
   reads. `advanced.useSecureCookies: true` for an https origin in production: confirmed a pure restatement
   (better-auth 1.7.18 `dist/cookies/index.mjs` is its only reader) and pinned by option value and cookie name.
2. **f2af96d (userinfo only)** — `USERINFO_TIMEOUT_MS = 10_000`, `AbortSignal.timeout`, `redirect: "error"`;
   `auth.userinfo.fetch_failed` now carries `errName` (no message); the login-profile log uses `errorForLog`.
   Not taken: `jwe`/withholding (N16, batch 7), id_token verification (N17).
3. **721d6e5 / 5620831** — `withNoStore` on every `/api/auth` return path and `no-store` on our 404; the copy
   fallback keeps every Set-Cookie. Mount-point (`''`, `/`) and outside-mount tests.
4. **6167cfd (adapted)** — new `src/app/api/auth/[...all]/route.code-flow.test.ts` through the real route: five
   hostile callbackURLs → 403 `INVALID_CALLBACK_URL`, cross-site Origin on a cookie-bearing POST → 403
   `INVALID_ORIGIN` (controls: relative and same-origin accepted), negative controls `disableOriginCheck: true` and
   `trustedOrigins: ["*"]`; callback state missing / mismatched / no cookie / tampered / >10 min, each with no token
   call (control: 9 min accepted); cookie attributes over http and, with an https `BETTER_AUTH_URL`, `__Secure-` +
   `Secure` on oauth_state, session_token and session_data.
5. **6aa1633 (adapted)** — `CODE_SHAPE = /^[A-Za-z0-9_]{1,64}$/` plus a string check, for both lookup and echo;
   the table moved to `src/app/auth-error/error-codes.ts`. Tests: free text, array, 65 chars not echoed; unknown
   well-formed code echoed; every `ERROR_MESSAGES` key matches.
6. **aa696f8** — global-error: `<a href="/">Reload the app</a>`, retry button only after hydration
   (`useSyncExternalStore`), imports only `react` (pinned).

**Checks:** tsc, lint clean; `test:run` 96 files / 2029 tests; `test:coverage` above the floors (59.66 / 50.77 /
50.8 / 60.9). `env -u BETTER_AUTH_URL -u MINISTRY_PLATFORM_BASE_URL npm run build` passed, but Next still loaded
`.env.local` ("Environments: .env.local"), so it proved little; a second build with `.env.local` moved aside and
the secret unset too also passed with no `[env]`/`[auth]` error and no "Base URL" warning (better-auth's
pre-existing "default secret" log lines appear, as in any build without a secret). `check:standalone` and
`check:shells` green on that build.
**Mutation check:** 33 mutants of the source changes (reverting each wiring, re-adding fallbacks, dropping the
timeout/redirect, unwrapping no-store, a lossy copy, `disableOriginCheck: true`, `trustedOrigins: ["*"]`, weaker
cookie attributes, the raw echo, upstream's lower-case regex, no link, an always-on button) each turned at least
one test red; all restored.
**Live (standalone, placeholder env, no MP write):** `/api/auth/get-session` 200, `/api/auth/nope` 404,
`/sign-in/social` 200 and the callback 302 all `cache-control: no-store`; `/auth-error?error=Call%20555` renders the
fallback with no `<code>` (the value is only in Next's escaped RSC payload, as documented); with
`BETTER_AUTH_URL` unset, every auth request is 500 with `[env] BETTER_AUTH_URL is not set.` logged and the process
stays up (`/auth-error` still 200).
**Next:** operator check that `BETTER_AUTH_URL` and `MINISTRY_PLATFORM_BASE_URL` are https in `/srv/mpcharts/.env`
and the Ironside dev `.env`; push, PR (security review section), `:dev` soak with a human sign-in and sign-out;
then mirror to event-manager, mp-senior-care and music-tools (route `app-url.ts` through `getAuthBaseUrl` in the
first two, or document its production fallback).
