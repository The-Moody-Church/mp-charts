# Session Summary — 2026-11-09

## Objective

Close the "proxy body-size item": the residual recorded since 2026-09-29 in CLAUDE.md, `security.md` and
`route.ts`, where Next buffered up to 10 MB of every anonymous `/api/auth` request body before the
route's 4096-byte filter and better-auth's rate limiter could refuse it. Then port to event-manager,
mp-senior-care and music-tools.

## mp-charts — PR #295 open, CI green (branch `fix/auth-route-skips-proxy-body-clone`)

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

## Ports — PRs open (same branch name in each)

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

## Follow-ups

- COMPLETED: `:dev` soak of all four (17:14 UTC, rollback pins by digest in each `/srv/<app>/`). Through
  Cloudflare: `/` 307 to `/signin`, `/signin` 200, `get-session` 200, and a 6 KB `/sign-in/social` body
  404 in 70–120 ms. Human sign-in and sign-out passed in all four apps.
- Page-path / Server Action residual: ideas.md entry, not started.
