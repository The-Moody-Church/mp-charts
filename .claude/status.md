# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `.claude/sessions/`.

**Last updated**: 2026-02-26

## Recently Completed

| Date | Work | Issues | Session |
|------|------|--------|---------|
| 2026-02-26 | **RBAC implementation** + upstream PR #50/#51 incorporation | #58, #49, #50 | [session](sessions/session-summary-2026-02-26.md) |
| 2026-02-25 | Mobile & responsive improvements (30+ files) | #13, #33 | [session](sessions/session-summary-2026-02-25.md) |
| 2026-02-24 | Shared processing components extraction + security audit | #60 | [session](sessions/session-summary-2026-02-24.md) |
| 2026-02-23 | Baptism processing + membership processing | #17, #47 | [session](sessions/session-summary-2026-02-23.md) |

## Open Issues

- [**#52** — Active Communities and Small Groups chart needs work](ideas.md#bug-active-communities-and-small-groups-chart-needs-work-52)
- [**#57** — IDOR mitigation (per-record authorization)](ideas.md#idor-mitigation--per-record-authorization-57)
- [**#15** — Small Group Trends chart visualization improvements](ideas.md#small-group-trends-chart-15)
- [**#19** — Pastoral interface for contact logs](ideas.md#pastoral-interface-for-contact-logs-19)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #51 / release v2026.02.26.1827 (reviewed 2026-02-26)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
