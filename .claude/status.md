# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `.claude/sessions/`.

**Last updated**: 2026-03-06

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|----|
| 2026-03-06 | **Chart YoY comparisons**: Community Attendance chart, Serving Trends YoY, date filter improvements (shift+click range, year auto-select, gap fill) | #68 | #76 |
| 2026-03-06 | **Venn diagram attendance circle**: average total attendance (in-person + online) | #67 | #75 |
| 2026-03-06 | **Permissions sort**: selected groups sorted to top in admin | #70 | #74 |
| 2026-03-05 | **Stale feature keys**: filter stale keys from permissions config | — | — |
| 2026-02-26 | **RBAC implementation** + upstream PR #50/#51 incorporation | #58, #49, #50 | [session](sessions/session-summary-2026-02-26.md) |

## Open Issues

- [**#73** — Issue description syncing (ideas.md ↔ GitHub)](ideas.md#issue-description-syncing-73)
- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)
- [**#52** — Active Communities and Small Groups chart needs work](ideas.md#bug-active-communities-and-small-groups-chart-needs-work-52)
- [**#57** — IDOR mitigation (per-record authorization)](ideas.md#idor-mitigation--per-record-authorization-57)
- [**#15** — Small Group Trends chart visualization improvements](ideas.md#small-group-trends-chart-15)
- [**#19** — Pastoral interface for contact logs](ideas.md#pastoral-interface-for-contact-logs-19)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #52 / release v2026.02.28.1353 (reviewed 2026-02-28)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
