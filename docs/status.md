# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-04-09

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-04-09 | **Sort options for journey & compliance tools**: Added sort dropdown (Last Name, Most Completed, Least Completed) to all processing pages. Shared `sortCards()` utility + `ProcessingSortSelect` component. 6 new tests. | — | — |
| 2026-04-08 | **Test coverage: 88 new tests across 8 files** (236→324 total). Adapted upstream PR #45 for our fork's auth/security patterns. Covers: user-context, session-context, user-menu sign-out, contact-lookup scoring/sorting, contact-logs CRUD actions, contactService with sanitization, contactLogService with Central Time date conversion, MinistryPlatformProvider delegation. | — | #156 |
| 2026-04-08 | **Upstream sync through PR #55**: Incorporated MP data safety write-confirmation rule into `.claude/rules/security.md`. Updated sync log. | — | — |

## Planned

- [**#136** — Upgrade TypeScript 5.9 → 6.0](ideas.md#upgrade-typescript-59-to-60-136) — TS 6.0.2 available (on 5.9.3). Transition release before TS 7.0 (Go rewrite). Main change: add `"types": ["node"]` to tsconfig. Wait until mid-April 2026 for ecosystem stability.

## Open Issues

- [**#110** — Serving metrics: reconcile adult-only vs all-ages counts](ideas.md#serving-metrics-reconcile-adult-only-vs-all-ages-counts-110)
- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #55 (reviewed 2026-04-08)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
