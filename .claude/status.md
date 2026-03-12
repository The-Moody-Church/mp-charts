# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `.claude/sessions/`.

**Last updated**: 2026-03-12

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|----|
| 2026-03-12 | **Venn diagram single-month fix**: Attendance circle now shows for single-month selections; fixed weekly→monthly conversion semantics | #83 | — |
| 2026-03-11 | **Auth callback redirect**: Preserve original URL through login redirect | — | #86 |
| 2026-03-11 | **Member photo upload fix**: Correct form field name mismatch in member detail modal | — | #87 |
| 2026-03-11 | **Manage Members**: Card-based membership management with status tabs, detail modal, expandable milestones, deep links, client-side transition overrides, cache refresh button, rate limit resilience | — | #84 |
| 2026-03-11 | **Cache warming everywhere**: Audited all `'use cache'` functions, confirmed all 6 are registered in `cache-warming.ts`, added missing cross-reference comments to `dashboardService.ts` and `cached-contacts.ts` | #80 | — |
| 2026-03-10 | **Contact lookup enhancements**: route rename, breadcrumbs, badges, family section, birthday, photo upload, View in MP, Copy Link, email/phone search, remove delete from logs, consolidate permissions | #19 | #81 |
| 2026-03-10 | **PWA**: service worker, offline fallback, iOS install prompt | — | #77 |
| 2026-03-10 | **Search ranking**: scored search with exact/starts-with/contains/Soundex/Levenshtein, both name orderings, search-as-you-type, cached contact lookup | #78 | #79 |
| 2026-03-06 | **Chart YoY comparisons**: Community Attendance chart, Serving Trends YoY, date filter improvements (shift+click range, year auto-select, gap fill) | #68 | #76 |
| 2026-03-06 | **Venn diagram attendance circle**: average total attendance (in-person + online) | #67 | #75 |
| 2026-03-06 | **Permissions sort**: selected groups sorted to top in admin | #70 | #74 |
| 2026-03-05 | **Stale feature keys**: filter stale keys from permissions config | — | — |

## Open Issues

- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)
- [**#52** — Active Communities and Small Groups chart needs work](ideas.md#bug-active-communities-and-small-groups-chart-needs-work-52)
- [**#57** — IDOR mitigation (per-record authorization)](ideas.md#idor-mitigation-per-record-authorization-57)
- [**#15** — Small Group Trends chart visualization improvements](ideas.md#small-group-trends-chart-15)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #52 / release v2026.02.28.1353 (reviewed 2026-02-28)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
