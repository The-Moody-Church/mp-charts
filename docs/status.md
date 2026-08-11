# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-08-11

## Recently Completed

> Retention note: the 7-day rule in `.claude/rules/context-management.md` would delete every row below,
> since the next-newest is 2026-06-24. The 2026-06-2x rows are kept deliberately — no session summaries
> exist for 2026-06-23/24 or 2026-07-10, so these are the only in-repo record that #190/#191/#192 shipped.

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-08-11 | **React Compiler lint — both admin tool editors done (plan's PR 2)**: the journey and compliance milestone-load effects moved into their `<select>` change handlers, separately — the compliance select isn't `disabled={isEditing}` and its three branches differ (switching back to the saved journey is a staff undo that restores verbatim with **no** MP call). Compliance mount case moved to a `useState(existingTool?.journeyId ? … : [])` ternary, which reproduces the old effect's wipe of orphaned milestones. Deleted a dead no-op effect. New `compliance-tool-editor.test.tsx` (5 characterization tests) — mutation-tested, and one assertion was rewritten after the "adopt the journey editor's merge" mutation passed all 5: two journeys never share a `Milestone_ID`, so the check moved to the save payload. Filed three verified pre-existing bugs in `ideas.md` rather than fixing them mid-refactor. `set-state-in-effect` 15→14; lint 0 errors, 558 tests, build clean. | [#197](https://github.com/The-Moody-Church/mp-charts/issues/197) | (stacked, unmerged) |
| 2026-08-07 | **React Compiler lint rules — 2 of 3 enforced**: `next` 16.3.0 pulled `eslint-plugin-react-hooks` 7.1, adding React Compiler rules that flagged 20 pre-existing violations. Fixed and restored to `error`: `immutability` (contact-lookup search re-ran from an effect calling `handleSearch` before its declaration — now an `onChange` with a **required** scope param) and `incompatible-library` (`watch()` opted contact-logs out of compilation — now `useWatch`). `set-state-in-effect` down 18→16 via the Shape 1 exemplar (both admin tool lists now read config server-side). Added characterization tests for `user-context` and `contact-lookup-search`, both mutation-tested. Full per-site plan in `.claude/notes/react-compiler-lint-plan.md`. | [#197](https://github.com/The-Moody-Church/mp-charts/issues/197) | (pending) |
| 2026-08-06 | **Dependency security remediation — all 17 Dependabot alerts cleared**: The deploy pipeline had been dead since 2026-07-10 — `build-scan-and-push` runs `npm audit --audit-level=high` before the Docker build and was exiting 1 on 6 highs, so no image shipped for 27 days. Bumped next 16.2.6→16.3.0 (8 alerts; sharp 0.34.5→0.35.3 came free via 16.3.0's `^0.35.3` pin, no override), postcss→8.5.26 (8.5.18 is *not* enough — GHSA-fxqj-rqcc-2cmp covers `<=8.5.22`), and lockfile-only undici→7.29.0, js-yaml→4.3.1, brace-expansion 1.1.13→1.1.18 and 5.0.7→5.0.9 (the `8ba3166` pin had been overtaken). Also fixed 16 latent test type errors that Next 16.3.0's wider build type-check surfaced, and scoped the new react-hooks 7.1 Compiler rules to `warn`. Closed Dependabot PR #193 as superseded. 539 tests pass, lint 0 errors, `npm audit` clean. Verified on TMC1 via a `:dev` soak before merge — cache warming 5/5, custom `cache-handler.js` confirmed working under 16.3.0. | — | #194, #195, #196 |
| 2026-06-24 | **Security review + top-3 fixes**: 15-dimension adversarial audit (report: `.claude/notes/security-audit-2026-06-23.md`; 23 confirmed / 27 refuted). Fixed: new `sanitizeId()` routed through every single-value numeric `$filter` sink (contact-log/journey/compliance/summer-blast) closing OData filter injection (F1) + added missing `top` cap; `deleteContactLog` ownership check (F3); user-profile actions bound to session GUID (F4); open-redirect backslash bypass in `signin` + `security.md` snippet (F5); F2 (cross-participant scope) since completed — the per-record scope check shipped and now runs in `enforce` mode in production (`F2_SCOPE_ENFORCEMENT=enforce`). 517 tests pass, lint clean. | — | #190, #191, #192 |
| 2026-06-23 | **@babel/core bump + lint cleanup**: Bumped @babel/core 7.29.0→7.29.7 (LOW sourceMappingURL file-read) — Dependabot board now fully clear. Resolved all pre-existing eslint errors/warnings: render-time pagination reset in `contact-lookup-results` (was setState-in-effect), consolidated client-only platform detection in `install-prompt`, `let`→`const`, removed dead imports, and eslint config (ignore `coverage/`, honor `_`-prefix, allow `require()` in `cache-handler.js`). `npm run lint` now 0 problems; build + 509 tests pass. | — | #184 |
| 2026-06-23 | **Dependabot security cleanup**: Cleared all open security alerts. Bumped undici 7.24.4→7.28.0 + vite 8.0.5→8.1.0 (3 HIGH: SOCKS5 cross-origin routing, TLS-bypass, `server.fs.deny` Windows bypass), esbuild 0.27.3→0.28.1 (low), js-yaml 4.1.1→4.2.0 (MEDIUM YAML-merge DoS), and added a `postcss: "$postcss"` override to dedupe Next 16's exact-pinned 8.4.31 nested copy to the patched 8.5.15 (MEDIUM CSS-stringify XSS). 0 high / 0 critical remaining; `next build` + 509 tests pass. | — | #181, #180, #183 |
| 2026-05-15 | **Summer Blast: expired status fix + signup-date sort**: Fixed checklist status when a person had an expired BG check or certification AND a new pending one — now shows `in_progress` with an inline "expired" badge (was: incorrectly showed as `not_started`). Added "Signup Date (Newest)" sort, default on Signups tab. | — | (pending) |
| 2026-05-15 | **Summer Blast: no cache + bulk-add**: Removed Summer Blast caching entirely — `/summer-blast-volunteers` now pulls fresh from MP on every page load (deleted `cached-data.ts`, unregistered from `cache-warming.ts`). Added per-card checkboxes on the Signups tab and a sticky bulk-action bar that confirms multi-signup enrollment as Temp role in one click (new `bulkAddToSummerBlast` action with per-item failure tracking). | — | #176 |
| 2026-05-14 | **Multi-file uploads + Refresh from MP**: Quick-Action and Edit forms in compliance/journey processing now accept multiple file attachments per milestone (validated per-file against 20 MB limit). Admin Journey and Compliance Tool editors have "Refresh from MP" buttons that re-fetch milestones/requirements and merge with current in-memory edits without losing label, visibility, or sort-order changes. | #170, #171 | #175 |

## Planned

- [**#136** — Upgrade TypeScript 5.9 → 6.0](ideas.md#upgrade-typescript-59-to-60-136) — TS 6.0.2 available (on 5.9.3). Transition release before TS 7.0 (Go rewrite). Main change: add `"types": ["node"]` to tsconfig. Wait until mid-April 2026 for ecosystem stability.

## Open Issues

- [**#110** — Serving metrics: reconcile adult-only vs all-ages counts](ideas.md#serving-metrics-reconcile-adult-only-vs-all-ages-counts-110)
- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)
- [**#161** — student leaders](https://github.com/The-Moody-Church/mp-charts/issues/161)
- [**#136** — Upgrade TypeScript 5.9 → 6.0](ideas.md#upgrade-typescript-59-to-60-136)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #66 (reviewed 2026-07-10)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
