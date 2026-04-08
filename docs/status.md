# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-04-08

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-04-08 | **Test coverage: 88 new tests across 8 files** (236→324 total). Adapted upstream PR #45 for our fork's auth/security patterns. Covers: user-context, session-context, user-menu sign-out, contact-lookup scoring/sorting, contact-logs CRUD actions, contactService with sanitization, contactLogService with Central Time date conversion, MinistryPlatformProvider delegation. | — | #156 |
| 2026-04-08 | **Upstream sync through PR #55**: Incorporated MP data safety write-confirmation rule into `.claude/rules/security.md`. Updated sync log. | — | — |
| 2026-04-07 | **CLAUDE.md restructure & CI security lint**: Extracted 5 rule files into `.claude/rules/` (723→191 lines). Added `security-lint` CI job that greps for unsanitized `.join()` in filter parameters. | — | — |
| 2026-04-07 | **Fix filter injection: sanitize ID arrays**: 5 instances of unsanitized `.join(",")` in filter parameters replaced with `sanitizeIds()`. Merged Dependabot vite 8.0.0→8.0.5 (path traversal fix). | — | #153, #154 |

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
