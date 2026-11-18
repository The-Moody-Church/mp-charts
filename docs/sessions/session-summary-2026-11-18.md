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

### Batch 1 — headers and proxy (N9, N13, N14) — IN PROGRESS

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
