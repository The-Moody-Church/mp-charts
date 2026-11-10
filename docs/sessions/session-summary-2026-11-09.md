# Session Summary — 2026-11-09

## Objective

Close the "proxy body-size item": the residual recorded since 2026-09-29 in CLAUDE.md, `security.md` and
`route.ts`, where Next buffered up to 10 MB of every anonymous `/api/auth` request body before the
route's 4096-byte filter and better-auth's rate limiter could refuse it. Then port to event-manager,
mp-senior-care and music-tools.

## mp-charts — PR #295 merged (branch `fix/auth-route-skips-proxy-body-clone`)

### What Next does (16.4.5 source)

- `attachRequestMeta` (`next-server.js`) wraps every request in `getCloneableBody`
  (`body-streams.js`). That alone only listens for `end`.
- When the proxy runs, `cloneBodyStream()` starts reading: every chunk goes to the proxy's copy and to a
  buffered replacement body, up to `proxyClientMaxBodySize` (default 10 MB). Past the limit it stops
  copying but keeps consuming.
- `finalize()` runs in a `finally` after the proxy returns and **awaits the original body's `end`**. So
  even a proxy that answers immediately (redirect, or a 413 if we wrote one) cannot reply before the
  client finishes sending. Rejecting inside the proxy would not have helped.
- For a path the matcher excludes, `cloneBodyStream()` is never called and nothing is read until the
  route reads it.

### Measured (local standalone build, Node, `NODE_ENV=production`)

| Probe | Before (matcher includes `/api/auth`) | After (excluded) |
|---|---|---|
| 64 KB body sent slowly to `/api/auth/sign-in/social` | 404 only after the last byte, 5.3 s | 404 in 37 ms |
| 20 × 9 MB held open, `/api/auth/sign-in/social` | 0 answered, +189 MB RSS | 20 answered |
| 20 connections × 45 MB of a declared 500 MB | — | all answered, RSS flat (+~40 MB) |
| Same, chunked (no Content-Length), 36 MB each | — | all answered, RSS flat |
| 20 × 45 MB to `/` (still proxied) | 0 answered, +~180 MB (10 MB cap each) | unchanged |

Normal sign-in POST still returns 200; `GET /api/auth/callback/ministryplatform` still redirects to
`/auth-error?error=state_not_found` without state; `X-Frame-Options` and `nosniff` still on auth
responses (from `next.config.ts`).

### Change

- `src/proxy.ts`: matcher gains `api/auth(?:/|$)` in its negative lookahead, with a comment giving the
  mechanism and numbers. Nothing is lost: `/api` was already a public early return, and the per-request
  CSP nonce is meaningless on JSON and redirect responses.
- `src/proxy.test.ts`: the two "Route Matcher" tests used a hand-copied regex that had already drifted
  from the real matcher (no `manifest.json`/`sw.js`/`offline.html`). Replaced with `it.each` tables
  driving the real exported `config` through `unstable_doesMiddlewareMatch`
  (`next/experimental/testing/server`): pages, `/signin`, `/auth-error`, `/api/cache-warm`,
  `/api/authority` and `/api/auth-extra` match; static assets and six `/api/auth` paths do not.
  With the old matcher restored, the six auth-path cases fail.
- `route.ts` comments (`readBodyWithLimit`, the filter docblock), CLAUDE.md and `security.md` updated:
  the cap is now the first read of the body; **do not add `/api/auth` back to the matcher**.
- `docs/ideas.md`: new entry "Anonymous POSTs to page paths still make Next buffer up to 10 MB each",
  the part not fixed here, with options; #252's entry points at it.

### Remaining residual (not in this change)

- Page paths and Server Actions still go through the proxy, so the 10 MB copy and the wait still apply
  to anonymous POSTs there. Server Actions also read up to their own 20 MB `bodySizeLimit` before
  `requireSession()`. Tracked in ideas.md.
- A body declaring a size within 4096 bytes and then stalling holds its connection until Node's 300 s
  request timeout, at a few KB of memory.

## Ports — PRs merged (same branch name in each)

All three had the same proxy shape (`/api` a public early return, no auth exclusion; music-tools'
matcher is the older one without `manifest.json`/`sw.js`/`offline.html`, left as is). Same matcher
change, `proxy.test.ts` matcher block (music-tools had none; its static-asset cases follow its own
matcher), `route.ts` comments, residual sentence in CLAUDE.md/`security.md`, status and sync-log rows.
The remaining-residual pointer goes to mp-charts' `docs/ideas.md` in all three.

| Repo | PR | Tests | 9 MB body → 404 |
|---|---|---|---|
| event-manager | #85 | 1443 | 34 ms |
| mp-senior-care | #244 | 1350 | 35 ms |
| music-tools | #201 | 448 | 40 ms |

tsc, lint, the audit gate and `next build` pass in each; a normal sign-in POST returns 200 and `/`
still redirects (307). On event-manager and mp-senior-care the chunked test's RSS stepped up ~190 MB
in round 3; a ten-round rerun on event-manager (1.8 GB pushed over 20 connections) plateaued at
~400 MB, so it is heap sizing, not retention.

## Merged and deployed — COMPLETED

- Merged after the `:dev` soak: mp-charts #295 `619760a`, event-manager #85 `12a3792`, mp-senior-care #244
  `24c2159`, music-tools #201 `fd37adf`. The three `main` builds for mp-charts, event-manager and mp-senior-care
  first failed with no jobs started (a GitHub incident affecting Actions and the Checks API, open at the time); reruns
  passed (mp-senior-care needed two). Deployed 18:27–18:39 UTC, each `:latest` label matching its merge commit.
  Cache warming finished on the first attempt in the three apps that have it; through Cloudflare, `/` 307,
  `/signin` 200, `get-session` 200 and a 6 KB `/sign-in/social` body 404 in 0.2–0.4 s on all four.

## Follow-ups

- COMPLETED: `:dev` soak of all four (17:14 UTC, rollback pins by digest in each `/srv/<app>/`). Through
  Cloudflare: `/` 307 to `/signin`, `/signin` 200, `get-session` 200, and a 6 KB `/sign-in/social` body
  404 in 70–120 ms. Human sign-in and sign-out passed in all four apps.
- Page-path / Server Action residual: ideas.md entry, not started.
- minimatch GHSA-g3hv-75wg-m249 (moderate, dev-only: `eslint-config-next` → `typescript-eslint` →
  `@typescript-eslint/typescript-estree` → `minimatch@10.2.6`; fixed only in 11.0.1+). Open in all four repos
  (mp-charts #79, event-manager #3, mp-senior-care #24, music-tools #155). typescript-eslint moved typescript-estree
  to `^11.0.1` on 2026-11-10 (PR 13145), after 8.72.2; their weekly release should ship it as 8.72.3 on
  2026-11-16. Then a lockfile-only `npm update` in all four (eslint-config-next takes `^8.56.0`). No override.

## #217 Node base image pin — COMPLETED (branch `chore/pin-node-base-image`)

- Owner chose a Node version pin over a digest pin. Data: Node 24 patch releases about twice a month (10 since
  May, 3 security); `24.22.2-alpine` was rebuilt 2026-11-05, nine days after the release, for Alpine alone; the
  runner's `apk upgrade` patches Alpine on every build regardless of base digest.
- `Dockerfile` (deps/builder/runner) and `Dockerfile.dev`: `node:24-alpine` → `node:24.22.2-alpine` (production
  already ran 24.22.2 on Alpine 3.24.4). CLAUDE.md "Node Runtime", DOCKER.md and the `dependabot.yml` comment updated.
- New `scripts/node-base-image.test.ts`: four FROM lines, each `node:X.Y.Z-alpine`, all identical, major matching
  `.nvmrc`. Putting one stage back on `node:24-alpine` fails 2 of its 7 tests.
- mp-charts PR #296. Ports (same branch name, same test, which also reads the workflows' `node-version:` since
  event-manager and mp-senior-care have no `.nvmrc`): event-manager #86 (4 lines, 1450 tests), mp-senior-care #245
  (4 lines, 1357 tests), music-tools #202 (3 lines, 454 tests). In each, a floating runner fails 2 of the new tests.
- Merged: mp-charts #296 `f025dea`, event-manager #86 `81f2eff`, mp-senior-care #245 `76e22a9`, music-tools #202
  `2ba412e`. No `:dev` soak (same Node version and image family as before). Deployed 2026-11-10 ~01:50 UTC: each
  `:latest` label matches its merge commit, all four run Node v24.22.2 on Alpine 3.24.4, cache warming finished on the
  first attempt where it exists, and `/` 307, `/signin` 200 and `get-session` 200 through Cloudflare.

## #252 Uploads of 10–20 MB — COMPLETED (branch `fix/server-actions-skip-proxy-body-clone`)

- Reproduced on a local production build of `main` (`a886945`) with a real `uploadMemberPhoto` multipart request
  (fake session cookie, so the proxy passes and the action stops at `requireSession()`): 1 and 9 MB reach the
  action; 12, 19 and 21 MB log "Request body exceeded 10MB" and fail with "Unexpected end of form".
- Fix: the proxy matcher becomes `{ source, missing: [{ type: 'header', key: 'next-action' }] }`. Same probe: 12 and
  19 MB reach the action; 21 MB gets "Body exceeded 20mb limit". `/` still 307s without a cookie, CSP still set,
  sign-in POST 200.
- Memory, 20 concurrent 19 MB actions × 7 rounds, fresh servers: old build settles ~610 MB, new ~930 MB. Per
  concurrent upload ~26 MB vs ~15 MB, because the action now decodes the full body. Bounded by the 20 MB
  `bodySizeLimit`; no container has a memory limit (host 62 GB).
- A GET with a forged `next-action` header skips the proxy: same static shell + in-stream redirect to `/signin`
  as a fake cookie already got (92.6% identical bodies, differences are nonces), minus the CSP header on that
  response. An expired session ends in an action error before and after (before: 307 → client "unexpected response").
- 5 new matcher tests; 4 fail on the old matcher. 1239 tests, tsc and lint pass. CLAUDE.md, security.md (also: the proxy no longer runs on
  actions, so `requireSession()` is their only gate), ideas.md (#252 completed, #297 narrowed to page paths), status.
- mp-charts PR #299. Ports (20 MB `bodySizeLimit`, same bug; same matcher, comment and tests, 3 of 4 new tests
  fail on the old matcher): event-manager #88 (1454 tests), mp-senior-care #248 (1361 tests). music-tools uses
  Next's 1 MB default and is unaffected, so it is not changed.
- `:dev` soak, 2026-11-10 15:12 UTC (rollback pins by digest to the #217 builds in each `/srv/<app>/`). Through
  Cloudflare, 1, 9 and 15 MB action probes (curl over HTTP/1.1 and HTTP/2, and Playwright Chromium over HTTP/3) all
  reached the action. Owner, signed in, in Edge: a 14.3 MB PDF and a 14.3 MB PNG attached to a volunteer-processing
  compliance milestone; over 20 MB refused client-side with a message. Sign-in and sign-out passed on events and care.
  A first PNG failed with `net::ERR_TIMED_OUT` before leaving the browser (nothing reached Cloudflare or the app): the
  file sat in a sync folder. Unrelated to this change.
- Merged: mp-charts #299 `5fb52c7`, event-manager #88 `65fdd19`, mp-senior-care #248 `902c562`. Main builds passed
  first time. Deployed 2026-11-10 ~18:00 UTC: each `:latest` label matches its merge commit, cache warming finished on
  attempt 1, `/` 307, `/signin` 200, `get-session` 200 through Cloudflare, and a 14.3 MB action probe on mptools reached
  the action (`Authentication required` for the fake session).

## Quick Action "Mark Complete" shows failures — COMPLETED (#300)

Found during the #252 soak: a PNG in a synced folder failed in the browser (`net::ERR_TIMED_OUT`) and the panel showed
nothing, because both detail modals (`handleQuickActionSubmit` in compliance, `handleMarkMilestoneComplete` in journey)
only `console.error`ed the failure, then reset.

- New `src/components/processing/quick-action-error.ts`: a `TypeError` (fetch never reached the server: "Failed to
  fetch" / "Load failed" / "NetworkError…") says nothing was saved, with a synced-folder hint. A server error with
  attachments says to check the list before retrying, because the record may exist without its file; without
  attachments, a plain retry. Never echoes the error text.
- `QuickActionsPanel` gets `submitError` (a `role="alert"` line under the button; the button stays usable, unlike a
  file error) and `onSubmitErrorChange` (cleared on close). Both modals set it, clear it on submit and on item change,
  and on a server error reload the participant detail so a partial save shows in the checklist.
- Server side: `createJourneyMilestone`, `createComplianceMilestone`, `createComplianceCertification` and
  `createComplianceFormResponse` validated attachments (type, size, header) and the upload rate limit **after** writing
  the record, so a rejected file left a record behind and a retry made a duplicate. Both now run first. MP upload
  failures can still leave a record without its file; the client message covers that case.
- Tests: helper 7, panel 3, compliance actions 12, journey actions 4 (new file). 12 of the 16 action tests fail on the
  old order. tsc, lint, 1265 tests and the audit gate pass.
- event-manager and mp-senior-care carry `quick-actions-panel.tsx` as unused template code (no modal renders it, no
  create actions), so nothing to port.
- Soaked on `:dev` (2026-11-10, `b76a885`): the synced-folder PNG through compliance Mark Complete showed the new
  message, and a normal upload saved (user-confirmed).
