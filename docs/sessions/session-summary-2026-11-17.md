# Session Summary — 2026-11-17

## Objective

Pick up the next follow-up from 2026-11-10: clear the minimatch alert (GHSA-g3hv-75wg-m249, moderate, dev-only) in
all four repos now that typescript-eslint has moved typescript-estree to `minimatch ^11.0.1`.

## minimatch update — COMPLETED (in the audit-gate PRs: typescript-eslint 8.73.0, minimatch 11.0.9)

- typescript-eslint shipped the fix as **8.73.0** on 2026-11-16 (not 8.72.3). eslint-config-next takes `^8.56.0`,
  so it is a lockfile-only update. All four repos have the same path: `eslint-config-next@16.4.5` →
  `typescript-eslint@8.72.1` → `@typescript-eslint/typescript-estree` → `minimatch@10.2.6`.
- Trial in mp-charts: `npm update` of the 11 `@typescript-eslint/*` packages. Lockfile only; 11 packages
  8.72.1 → 8.73.0, minimatch 10.2.6 → 11.0.9, brace-expansion 5.0.12 → 5.0.13, ignore 7.0.14 → 7.0.16, and one new
  package, `@isaacs/nonrecursive-glob-match@1.1.0` (minimatch 11's dependency, same author). minimatch@10 gone; tsc
  and lint pass.
- **The audit gate then failed** on a new advisory, so the change was discarded rather than held on a red branch.
  Redo it with the picomatch update below, in one `npm update`.

## picomatch GHSA-fc5q-39xc-vjpf — RESOLVED by the audit-gate change below (deploys unblocked 2026-11-17)

- picomatch `<= 4.0.7`, ReDoS via single-branch repeated extglobs (`+(*)`), CVE-2026-112366, HIGH, **no patched
  version**. Published 2026-10-19, GitHub-reviewed 2026-11-17 15:56 UTC, which is when npm audit started reporting it
  (that morning's nightly audit passed). `main`'s lockfile: 13 HIGH in each repo. Every CI run now fails `verify`.
- **Production is not affected.** The running mp-charts image has no npm picomatch, vitest, vite, tinyglobby, fdir or
  micromatch. The only copy is `next/dist/compiled/picomatch` (vendored, invisible to npm audit), used by
  `match-remote-pattern` / `match-local-pattern` for `images.remotePatterns`/`localPatterns`. The globs come from
  `next.config.ts`, not from users, and the attack needs an attacker-supplied glob.
- **Why an allow-list entry doesn't work.** better-auth 1.7.18 declares `vitest` as an optional peer (for
  its `better-auth/test` export, `dist/test-utils`). Since vitest is also a devDependency, the lockfile marks it `devOptional`, and
  `npm audit --omit=dev` keeps it. The gate's production-tree check therefore reports picomatch as reaching
  production. A probe with a temporary entry exited 1 ("now reaches a production dependency"). `--omit=peer` still
  leaves 5 HIGH; `--omit=optional` would also hide shipped optional packages (sharp's binaries). Per security.md
  this needs a change to the gate itself.
- **Owner's decision: wait for the upstream fix.** Five community fix PRs were opened on picomatch that day (#254,
  #257–#261), none merged. In March picomatch shipped 2.3.2 and 4.0.4 on the same day. If an urgent deploy comes
  first, change the gate instead: an opt-in allow-list field accepting one named optional-peer path
  (better-auth → vitest), checked against the lockfile, byte-identical in all four repos.
- Note that micromatch pulls picomatch 2.x (2.3.2), so the fix needs a 2.3.x release as well as 4.0.x, or
  the eslint path stays flagged.

## Audit gate: `production_via_optional_peer` — COMPLETED (mp-charts #309, event-manager #90, mp-senior-care #251, music-tools #204)

The owner approved changing the gate after all. Implemented in an mp-charts worktree; still to port to event-manager,
mp-senior-care and music-tools (the three gate files stay byte-identical; the check against each repo's real lockfile
already proves the entry there).

- New optional allow-list field `production_via_optional_peer: [{ from, peer }]` (1–4 exact edges; plain lowercase
  npm names; `from` is not the advisory's package; `review_by` at most 45 days after `added`).
- When the production audit lists such an entry, the gate reads `package-lock.json` + `package.json` (only those two
  names) and proves, from the lockfile, that no node of the package is reachable from the root's production edges
  once exactly those optional-peer edges are removed. The reach model reproduces Arborist's `Node.resolve`,
  `loadDeps` edge order and `calcDepFlags`, and must equal npm's own non-dev set in the lockfile first. Integrity
  doubts exit 2; a broken premise or a witness path exits 1.
- Allow-list entry added: GHSA-fc5q-39xc-vjpf (picomatch), better-auth > vitest, review by 2026-12-17.
- Companion change: the typescript-eslint 8.73.0 lockfile update (fixes the minimatch co-root, GHSA-g3hv-75wg-m249).
  Without it typescript-estree is still a mixed-root violation.
- New repo-local guard `src/test-only-imports.test.ts` (the graph proof cannot see Next's standalone trace). After
  adversarial review it is an allow-list, not a deny-list: every runtime import (src/** outside tests, plus
  `cache-handler.js` and `next.config.ts`) must be a Node builtin or a `dependencies` entry reachable without
  optional peers (exception: `@better-auth/core`); `better-auth/test` is refused by name (the first version named
  `better-auth/test-utils`, which is not an export, and missed tinyglobby/vite/fdir/picomatch). It narrows the gap,
  it does not close it.
- Review fixes, same branch: the production check now matches the GHSA id alone (an advisory under another package,
  or none, in `--omit=dev` was read as absent and only warned); the repo-lockfile test fails with "remove
  production_via_optional_peer" once the peer stops carrying picomatch (documented as stricter than the gate); the
  entry's reason names Next's vendored picomatch 4; the workflow comments describe the field.
- `node scripts/audit-gate.mjs` exits 0 with the proof as a `::notice::`. With the field removed it exits 1 with the old
  "now reaches a production dependency" error.
- Round-2 review (the graph is not the image): a reviewer built picomatch into the standalone output past the guard
  (`createRequire`, `@/../node_modules/...`, a route importing a `__mocks__` file, `outputFileTracingIncludes`) with the
  gate still exiting 0. Fixes:
  - New post-build check `scripts/check-standalone.mjs` (+ `standalone-check-lib.mjs` / `.test.ts`,
    `npm run check:standalone`), run after the build in `verify` and in the Dockerfile builder stage. Every npm file
    the server build copies into `.next/standalone`, lists in an `.nft.json` trace, or bundles into a server chunk
    (read from its source map) must be in the production graph without optional peers. Measured: the real build
    passes (102 nodes; notices for `semver/package.json` and lucide's `shared/src` map names); the reviewer's
    `outputFileTracingIncludes` build and a build with the three bundling routes both exit 1 naming picomatch.
  - The source guard now resolves `@/` and relative imports (must stay in src/, resolve to a file, and not be a
    test/mock/test-setup file), reads `module.require`, `import.meta.resolve` and `@jsxImportSource`, refuses
    `createRequire` and `require` used as a value, refuses every picomatch/micromatch specifier (Next's vendored copy
    included), pins `next.config.ts`'s options, and fails on an extglob image pattern.
  - The follow-up "CI: check the built image has no npm picomatch" (added to ideas.md on this branch) is done by the
    build check and was removed.
  - Not done here (this step was scoped to mp-charts): event-manager and music-db carry the same field with no
    guard and no build check. Port `scripts/check-standalone.mjs`, `standalone-check-lib.mjs` and its test (they are
    repo-agnostic apart from the CI-wiring test and the real-lockfile node list) to all three siblings, with the
    `verify` step and Dockerfile line, before their entries keep the field; mp-senior-care's guard copy needs the
    same hardening.

## When picomatch ships (still to do: take the fixed release and drop the allow-list entry)

In each of mp-charts, event-manager, mp-senior-care and music-tools: branch, `npm update` the typescript-eslint
packages and picomatch (lockfile only, `package.json` unchanged), `node scripts/audit-gate.mjs`, tsc, lint, tests,
then a PR with a Security Review section. No `:dev` soak needed (dev tooling only).

## #212 Coverage measures the whole project — COMPLETED (#301)

- Picked next because it needs no deploy (the audit gate blocks deploys until picomatch ships).
- `vitest.config.ts`: `coverage.include: ['src/**/*.{ts,tsx}', 'scripts/audit-gate-lib.mjs']`; also excludes
  `src/lib/providers/ministry-platform/scripts/**` (the `mp:generate:models` CLI, 315 statements, not app code).
- Measured with the same 1265 tests: before, 60.56% statements over 130 files (only files a test imported); after,
  **45.27%** statements, 40.25% branches, 38.92% functions, 46.64% lines over 217 files. No test, `.d.ts` or
  generated-model files enter the count.
- `coverage.thresholds` { statements 45, branches 40, functions 38, lines 46 }: passes now; `--coverage.thresholds.statements=46`
  fails with exit 1. CI runs `test:run`, not coverage, so the floors are local only (CI enforcement not proposed: it
  would slow `verify`).
- The 88 newly counted files are mostly components and pages, plus 18 type-only files with no statements. Real
  gaps: `dashboardService.ts` (550, no test), `admin/journey-tools/actions.ts` (91), `admin/compliance-tools/actions.ts`
  (81), `dashboard/actions.ts` (40), cache warming. New ideas.md entry for them.
- Docs: `.claude/rules/testing.md` (the old "65%+" floor replaced), README test configuration, ideas.md (#212
  completed), status.md (row added; rows before 2026-11-10 pruned, June rows kept).
- Siblings (event-manager, mp-senior-care, music-tools) have no `coverage.include` either. Not ported; #212 is
  mp-charts-specific.
- Merged as #301 on 2026-11-17 with owner approval over the known picomatch audit failure (`verify` stopped at
  the audit step; lint, tsc and 1265 tests pass locally). Test config only, so no deploy.

## #302 Tests for dashboardService and the dashboard/admin actions — COMPLETED (#303)

- Ultracode workflow 1 (6 agents, one test file each): `dashboardService.{core,trends,engagement}.test.ts`,
  `admin/{journey,compliance}-tools/actions.test.ts` and `dashboard/actions.test.ts`; 285 tests, no source change.
- Workflow 2: one mutation tester per file, each in a worktree (134 mutants; every survivor was either killed by new tests
  or shown to be an equivalent mutant: the `Math.min` worker cap, the type-13 groupTypes filter, the `typeof year` guard),
  then a strengthening pass per file (+22 tests). Two independent skeptics per reported bug (reproduce and impact lenses).
- Result: 1568 passing tests plus 3 `it.fails` (known gaps in the compliance admin actions). Stable over two full runs and
  under `TZ=America/Chicago`. tsc and lint clean. Coverage is 54.10 / 45.42 / 44.99 / 55.33 (from 45.27 / 40.25 / 38.92 / 46.64);
  thresholds raised to 54/45/44/55. Per file: `dashboardService.ts` 99.8% statements, and the three actions files 100%.
- **15 suspected source bugs, 13 confirmed and 2 refuted** (B7: the empty-list early return before the admin check
  reveals nothing; B4 confirmed by only one of the two reviewers, so it is filed as low). Filed in ideas.md as five entries:
  - Medium: the dashboard caches empty data when one MP read fails (B9, B11, B12, B13); services on the last day of a
    month are excluded (B8, B15, latent B10); row-order-dependent start/end merge undercounts active people (B14).
  - Low: admin action hardening, i.e. the write rate limit, saving the parsed config, and cache clear order (B2–B6); the
    ministry year rolls over on UTC (B1).
- One leftover workflow worktree (no commits, only a `node_modules` link) was removed.
- Merged as #303 with owner approval over the known picomatch audit failure. Tests only, so no deploy.

## Dashboard: services on the last day of a month — IN PROGRESS (branch `fix/dashboard-data-correctness`)

- Fixes the ideas.md entry "Dashboard leaves out services held on the last day of a month" (B8, B15, latent B10).
- New pure module `src/lib/providers/ministry-platform/utils/mp-date-range.ts` (`calendarDay`, `addDays`,
  `toMpDateRange`, `monthWindows`, `mpMonthKey`) + `mp-date-range.test.ts` (run under TZ UTC, America/Chicago and
  Asia/Tokyo). Caller `Date`s are inclusive calendar days; every range is half-open on MP wall-clock strings
  (`>= 'YYYY-MM-DD 00:00:00' AND < '<day after end> 00:00:00'`). Never `toMpSqlDatetime(callerDate)`.
- `dashboardService.ts`: every date filter moved off `toISOString()` and `<=`. Events filter on `Event_Start_Date` at
  both ends; span overlaps use `Start_Date < endExclusive AND (End_Date IS NULL OR End_Date >= start)`.
  `getSmallGroupTrends` steps integer months (no skipped month from a 31st start) and compares MP day strings. The
  monthly-attendance and Activity_Log "today" caps use the Central current month. Callers and cache keys unchanged
  (comments only in `cached-data.ts`, `cache-warming.ts`).
- Tests: trends/core/engagement updated to the new literal filters; new behavioural tests feed MP-shaped rows through a
  small fake of MP's date predicates (last-day service in monthly, weekly, event participants, community and
  `getDashboardData` with an Aug 31 midnight end; small-group last-day start and 31st start; Central today cap;
  engagement final day). Checked against HEAD's service: those tests fail there. Dashboard tests also pass under
  `TZ=America/Chicago` and `TZ=Asia/Tokyo`.
- Docs: `datetimehandling.md` gains "Date ranges in `$filter`" (and the stale `dashboardService.ts:574-575` follow-up
  is replaced by the remaining bucketing-key follow-up); CLAUDE.md Timezone Handling bullet; ideas.md entry COMPLETED.
- To confirm on the dev soak: the Nov 30 2025 and Aug 31 2025 services now appear (the `'YYYY-MM-DD 00:00:00'` literal
  relies on MP's us_english DATEFORMAT; the ISO `T` form is the fallback).

## Dashboard: empty data cached when one MP read fails (#304) — IN PROGRESS (branch `fix/dashboard-data-correctness`)

- All 11 `dashboardService.ts` readers now log (`errorForLog`) and rethrow instead of returning `[]`/zeros/empty Set:
  the 9 in the ideas.md entry plus `getGroupTypeMetrics` and `getPeriodMetrics`. Legitimately empty MP answers still
  return empty through their early returns. Only the catch bodies changed (messages kept), so the lastday/dedup hunks
  in the same methods are untouched.
- Aggregators (`getDashboardData`, extended, engagement) stay all-or-nothing `Promise.all`, with a comment saying why:
  each result is one cache entry, so a per-section fallback would cache an empty section.
- `getEngagementRawData`: Activity_Log months go through `mapWithConcurrency(…, 6, …)` (was ~51 at once), and **any**
  failed month rejects before Step 2. Decision: all-or-nothing, not the ideas.md text's partial success, because the
  months are unioned into one Venn set (a dropped month is an invisible undercount). One-line switch if wanted:
  `failures === months.length`.
- `service-cache.ts`: a failed background refresh is now `console.warn`ed (keys are server-computed) instead of
  swallowed silently.
- Tests: the catch-and-return-empty tests in core/trends/engagement inverted; new per-section `getDashboardData`
  rejection tests, mid-chain batch failures, Activity_Log max-6-in-flight and ordering tests, a service-cache refresh
  test, and new `src/components/dashboard/cached-data.test.ts` (real serviceCache: a failed refresh keeps the good
  roster; a failed cold read caches nothing and the next call re-queries MP). 39 new/inverted tests fail on the
  pre-fix service (checked by swapping it in).
- Docs: caching.md ("Never silently return empty data") now states the propagate / per-bucket / all-or-nothing rules;
  CLAUDE.md MP API Concurrency names the Activity_Log fan-out; ideas.md #304 COMPLETED, and the #304–#306 issue links
  added to the three completed dashboard entries so the sync closes them instead of opening duplicates.
- Behaviour change to watch on the soak: on a cold cache an MP failure now shows the error boundary (core) or leaves
  extended/engagement charts at their defaults, uncached, rather than caching zeros. The `[cache-warm] ✗` log line
  now appears where a false ✓ used to.
- Follow-ups (not done): `getPeriodMetrics`' server read looks dead (recomputed client-side); a process-wide MP
  concurrency limit across the three dashboard fetches (~31 at peak). (`getMonthlyAttendanceTrends`' partial success
  was fixed in the review follow-ups below.)

## Dashboard fix: review follow-ups (11 findings) — IN PROGRESS (branch `fix/dashboard-data-correctness`)

Each finding was checked first; all were real (two pairs were the same defect). Fixed, with tests:

- **Last day in the browser** (2 findings): `filter-dashboard-data.ts` compared `new Date(mp)` against the
  selection's `endDate`, midnight at the start of the last day, so serving/roster/group spans and milestones stamped
  later that day were still dropped (real MP rows exist). Range checks now compare `'YYYY-MM-DD'` strings
  (`mpSpanOverlapsDays`, `countDatesInRange`, the per-month serving trend). 9 new tests, passing under UTC, Chicago,
  Auckland and Los Angeles.
- **Bucket keys** (2 findings): weekly, community, event-participant and roster-attendance keys are sliced from the MP
  string, and the Sunday check uses the day string's UTC weekday. The Aug 31 core test failed under
  `TZ=Pacific/Auckland` before; the three service files now pass under Auckland, Kiritimati, Lord Howe, Chicago and UTC.
  New "whatever the process zone" tests switch TZ mid-run.
- **Monthly attendance all-or-nothing** (2 findings): any failed month now rejects (it used to drop the month and
  cache the rest, skewing `computePeriodMetrics`). Partial-success tests inverted; a `getDashboardData` single-month
  rejection test added; caching.md no longer names partial success as the pattern.
- **Refresh keeps the last good value**: new `serviceCache.markForRefresh(prefix)` replaces `deleteByPrefix` in
  `refreshDashboardCache`: forced foreground fetch, old value kept until it succeeds, one shared in-flight fetch per
  key. `DashboardShell.handleRefresh` uses `Promise.allSettled`, keeps whatever failed, shows an inline message, and
  never lets a rejection reach the error boundary. New `dashboard-shell.test.tsx` (8 of 10 fail on the old shell),
  service-cache and cached-data end-to-end tests.
- **Failed stages say so**: `extendedError` / `engagementError` make those cards show "could not be loaded" instead of
  placeholder zeros (the Venn also when extended failed, since its serving circle comes from there).
- **Warm retry**: new `src/lib/cache-warm-retry.ts`; a warm answered with `success: false` is retried after 1, 3 and 5
  minutes (startup and 6:00 AM). 8 tests.
- **Boundary tests**: small-group exclusive month end, community first-day and day-after Sundays. Mutation-checked:
  `<`→`<=`, `>=`→`>`, `<`→`<=` and reverting the weekly slice each fail a test.
- Docs: caching.md (refresh rule, all-or-nothing fan-outs, warm retry, stage errors), datetimehandling.md (browser
  checks, bucket keys; the bucketing-key follow-up removed), CLAUDE.md timezone paragraph, ideas.md #304/#305, status.md.

## Dashboard fix: second review round and soak — IN PROGRESS (branch `fix/dashboard-data-correctness`)

- Round-2 review (five lenses, two skeptics per finding): 10 findings, 3 confirmed and fixed in `5d95f60`:
  `refreshDashboardCache`'s `updateTag` re-rendered `/dashboard` inside the action response, where a failed forced fetch
  reached the error boundary; the previous-period shift rolled Feb 29 to Mar 1; `getDashboardData` read the monthly series
  twice. The other 7 were refuted by both skeptics.
- Merged `main` (the audit-gate change) into the branch; conflicts in `vitest.config.ts` and the ideas.md TOC only.
  After the merge: 1843 tests + 3 `it.fails` (UTC and Central), tsc, lint, the audit gate, the build and
  `check:standalone` all pass; coverage 59.44 / 50.32 / 50.60 / 60.66, floors raised to 59/50/50/60.
- Next: CI builds `:dev` from this branch; owner soaks it on mptools (approved 2026-11-17).

## Files changed

- `docs/status.md` — open-findings line for the picomatch block; last-updated date.
- `docs/sessions/session-summary-2026-11-17.md` — this file.
- Branch `fix/coverage-include-212`: `vitest.config.ts`, `.claude/rules/testing.md`, `README.md`, `docs/ideas.md`,
  `docs/status.md`.

### Gate rollout

- CI green on all four PRs (verify incl. the audit gate and `check:standalone`, and build-scan-and-push incl. the
  Dockerfile check and Trivy): mp-charts #309, event-manager #90, mp-senior-care #251, music-tools #204. The six shared
  scripts are byte-identical in all four; music-tools runs the standalone check only in its Dockerfile (no runner build),
  and the shared CI-wiring test accepts either layout.
- Merged with owner approval 2026-11-17. No runtime change, so no deploy needed for the gate itself.
