# Session Summary — 2026-11-17

## Objective

Pick up the next follow-up from 2026-11-10: clear the minimatch alert (GHSA-g3hv-75wg-m249, moderate, dev-only) in
all four repos now that typescript-eslint has moved typescript-estree to `minimatch ^11.0.1`.

## minimatch update — BLOCKED (waiting on picomatch)

- typescript-eslint shipped the fix as **8.73.0** on 2026-11-16 (not 8.72.3). eslint-config-next takes `^8.56.0`,
  so it is a lockfile-only update. All four repos have the same path: `eslint-config-next@16.4.5` →
  `typescript-eslint@8.72.1` → `@typescript-eslint/typescript-estree` → `minimatch@10.2.6`.
- Trial in mp-charts: `npm update` of the 11 `@typescript-eslint/*` packages. Lockfile only; 11 packages
  8.72.1 → 8.73.0, minimatch 10.2.6 → 11.0.9, brace-expansion 5.0.12 → 5.0.13, ignore 7.0.14 → 7.0.16, and one new
  package, `@isaacs/nonrecursive-glob-match@1.1.0` (minimatch 11's dependency, same author). minimatch@10 gone; tsc
  and lint pass.
- **The audit gate then failed** on a new advisory, so the change was discarded rather than held on a red branch.
  Redo it with the picomatch update below, in one `npm update`.

## picomatch GHSA-fc5q-39xc-vjpf — deploys blocked in all four repos

- picomatch `<= 4.0.7`, ReDoS via single-branch repeated extglobs (`+(*)`), CVE-2026-112366, HIGH, **no patched
  version**. Published 2026-10-19, GitHub-reviewed 2026-11-17 15:56 UTC, which is when npm audit started reporting it
  (that morning's nightly audit passed). `main`'s lockfile: 13 HIGH in each repo. Every CI run now fails `verify`.
- **Production is not affected.** The running mp-charts image has no npm picomatch, vitest, vite, tinyglobby, fdir or
  micromatch. The only copy is `next/dist/compiled/picomatch` (vendored, invisible to npm audit), used by
  `match-remote-pattern` / `match-local-pattern` for `images.remotePatterns`/`localPatterns`. The globs come from
  `next.config.ts`, not from users, and the attack needs an attacker-supplied glob.
- **Why an allow-list entry doesn't work.** better-auth 1.7.18 declares `vitest` as an optional peer (for
  `better-auth/test-utils`). Since vitest is also a devDependency, the lockfile marks it `devOptional`, and
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

## When picomatch ships

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

## Files changed

- `docs/status.md` — open-findings line for the picomatch block; last-updated date.
- `docs/sessions/session-summary-2026-11-17.md` — this file.
- Branch `fix/coverage-include-212`: `vitest.config.ts`, `.claude/rules/testing.md`, `README.md`, `docs/ideas.md`,
  `docs/status.md`.
