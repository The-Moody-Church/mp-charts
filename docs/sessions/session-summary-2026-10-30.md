# Session Summary — 2026-10-30

## #281 deployed — COMPLETED

The #277 follow-up (end-dating writes need an active row; complete bound to the tracking group;
member photo errors shown) soaked on `:dev` from 2026-10-28, merged as `1e4f79a` and is on `:latest`.
Caches warmed, and the log has no errors or `[scope:deny]` lines. See `session-summary-2026-10-28.md`.

## npm audit gate parity across the four apps — COMPLETED

- **music-tools #187** (`ci/audit-gate-high`): the audit step was `npm audit --audit-level=critical`,
  under which zod GHSA-mrhx-c7xc-m3w5 (HIGH, production) went unnoticed for days. It is now
  `node scripts/audit-gate.mjs` with the three gate files copied byte-identical from here and an empty
  allow-list. vitest includes `scripts/**/*.test.ts` (59 tests). A new `audit-nightly.yml` is added.
  The gate passes on Node 22 / npm 10.9.8, CI's toolchain there.
- **event-manager #74** (`ci/audit-nightly`): adds `audit-nightly.yml` (Node 24). Its docs still
  described the braces allow-list entry removed on 2026-10-24; corrected. **Dependabot security alerts
  were off there and are now on** (one moderate dev-scope alert, `postcss-selector-parser`).
- **mp-senior-care #232**: the same stale braces wording in both workflow comments and the security rule.
- **mp-charts** (`main`, docs): `.claude/rules/security.md` now says the gate files are byte-identical
  in four repos.

Merged 2026-10-30 (owner approved): music-tools #187 `a5f5818`, event-manager #74 `142e8f6`,
mp-senior-care #232 `49da211`. All four apps now gate at HIGH with the same allow-list gate (the three
files `cmp`-identical against mp-charts after the merges), run it nightly at 07:00 Central and have
Dependabot alerts on. CI/docs only, so no deploy.

## Unused typography plugin removed (postcss-selector-parser alert) — IN PROGRESS

Dependabot alert #77 (GHSA-rj75-hqrm-r3gf, moderate, dev) was open in mp-charts, event-manager and
mp-senior-care, all through `@tailwindcss/typography` 0.5.20, which pins `postcss-selector-parser` to exactly
6.0.10 and has no newer release. None of the three uses the plugin (no `@plugin` line, no `prose` class), so it
is removed rather than overridden. mp-charts: the two built CSS files are byte-identical before and after;
`npm audit` is zero at every severity. The mp-charts PR also takes Dependabot #278 (eslint-config-next 16.4.3).
event-manager and mp-senior-care stay on their `eslint-config-next` (16.4.x breaks their lint).

## Pending

- Dependabot majors (vitest 5 group #263/#265/#271 first), audit LOW items N9–N19, upstream sync log
  for `75d249d..aa1bc64`.
- `scripts/audit-gate-lib.test.ts`'s "CI wiring" comment still names three repos; change it in all
  four together the next time the gate files change.
