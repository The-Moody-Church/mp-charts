# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-05-15

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
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
- Upstream sync current through PR #55 (reviewed 2026-04-08)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
