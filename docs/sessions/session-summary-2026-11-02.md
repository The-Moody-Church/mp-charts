# Session Summary — 2026-11-02

## Vitest 5 upgrade (#241) — COMPLETED

Dependabot opened vitest 5.0.5 (#263), @vitest/coverage-v8 5.0.5 (#265) and jsdom 30.1.3 (#271) as
separate PRs. The two vitest ones each fail `npm ci` (ERESOLVE): the coverage plugin pins its vitest
major, so they can only move together. One branch, `chore/vitest-5`, takes all three.

- **Tests:** all 1206 passed on the first run, unchanged. A search for the patterns the 5.0 migration
  guide breaks (nested `vi.mock`, `toThrow('')`, `sequential`, pool ids, removed entry points,
  `expect.poll`, class mocks, snapshots) found none.
- **Types:** `tsc` failed on `toBeInTheDocument`. jest-dom augments `Assertion<T>`; Vitest 5's is
  `Assertion<R, T>`, so the augmentation no longer merges (testing-library/jest-dom#738; jest-dom 7.0.1
  is unchanged, fix pending in PR #742). New `src/vitest-jest-dom.d.ts` augments `Matchers<R, T>`, the
  interface Vitest 5 documents. A throwaway probe confirmed a jest-dom matcher type-checks, a wrong
  argument type fails and an unknown matcher fails.
- **Coverage:** Vitest 5 matches `coverage.exclude` relative to the root, and the bare
  `src/lib/providers/ministry-platform/models/` exclude stopped matching: 128 → 408 files (all 280
  generated models). The directory excludes are now `/**` globs; the covered file list is identical to
  Vitest 4's (diffed), totals within 0.05 points.
- **jsdom 30:** testing-library/jest-dom#741 (`toHaveFormValues` broken on jsdom 30) does not apply;
  nothing here uses it. jsdom 30 needs Node ^24.15, which CI's `.nvmrc` 24 resolves to.
- **Docs:** `.claude/rules/testing.md` gains a Vitest 5 behaviour section (`clearMocks` on by default,
  top-level `vi.mock`, awaited `.resolves`, the jest-dom type stopgap, `/**` coverage globs).
  ideas.md #241 marked completed; #212 notes the new pattern semantics.

Merged as `beb6ffe` (#283); Dependabot #263, #265 and #271 closed as superseded. Test toolchain only, no deploy.

## Sibling ports — COMPLETED

All merged 2026-11-02: mp-senior-care #234 `221b38c`, event-manager #77 `f13fb8b`, music-tools #188 `9769048`
(Dependabot #167 closed as superseded). All CI green. Test tooling only, no deploys.


- **mp-senior-care #234**: vitest 4.1.12 → 5.0.5 + coverage-v8 5.0.5 + jsdom 30.1.3. Locked to 5.0.5: vitest
  **5.1.0 was published the same day** (16:12 UTC) and `npm install vitest@^5.0.5` picked it up, so it was
  reinstalled at the tested version. jest-dom types via `import '@testing-library/jest-dom/vitest'` in
  `src/test-setup.ts` (event-manager's fix from 2026-10-01; one line, no `.d.ts`). Coverage file set
  identical to vitest 4's (77). 1309 tests.
- **event-manager #77**: already on vitest 5 since 2026-10-01, and its bare `models/` exclude had been
  counting all 284 generated models since then (401 files). Now 117, exactly the previous set minus models.
- **music-tools #188**: already on vitest 5; no `models/` directory, so the exclude is moot. jsdom 30.1.3
  on a fresh branch, replacing Dependabot #167, whose branch predated the audit gate (#187) and failed it
  with a missing script. (A `@dependabot rebase` comment was blocked by auto mode.) 415 tests.
- **Simpler jest-dom fix exists**: event-manager's one-line `/vitest` import does what mp-charts'
  `src/vitest-jest-dom.d.ts` does (probe-verified in both). mp-charts could swap to it and drop the file.

## Noticed, not in this PR

- **New moderate advisory GHSA-g3hv-75wg-m249** (minimatch < 11.0.1, DoS via globparts), already on
  `main`: 16 moderate findings, all the eslint 9 toolchain (eslint, typescript-eslint,
  eslint-config-next plugins → minimatch 3.1.5 / 10.2.6). Dev-only (`npm ls minimatch --omit=dev` is
  empty); the gate ignores moderate. Likely the same in the siblings. Fix candidates: eslint 10
  (Dependabot #262) or an `overrides` entry once compatible minimatch releases exist.
- The Vite "configLoader: 'native'" warning about `vitest.config.ts` predates this (also on Vitest 4).

## Pending

- Remaining Dependabot majors: TypeScript 7 (#269), eslint 10 (#262), lucide-react 1.x (#279),
  dotenv 18 (#280), chalk 6 (#261), jest-dom 7 (#266).
