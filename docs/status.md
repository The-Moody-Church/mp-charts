# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-04-07

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-04-07 | **CLAUDE.md restructure & CI security lint**: Extracted 5 rule files into `.claude/rules/` (723→191 lines). Added `security-lint` CI job that greps for unsanitized `.join()` in filter parameters. Enhanced pre-commit checklist with explicit security check. | — | — |
| 2026-04-07 | **Fix filter injection: sanitize ID arrays**: 5 instances of unsanitized `.join(",")` in filter parameters replaced with `sanitizeIds()` in journey-tools/actions.ts (4) and contactService.ts (1). Merged Dependabot vite 8.0.0→8.0.5 (path traversal fix). | — | #153, #154 |
| 2026-04-04 | **Update GitHub Actions to Node.js 24**: All workflow actions updated to latest major versions (checkout v5, buildx v4, login v4, build-push v7, github-script v8). Pinned trivy-action from `@master` to `v0.35.0` (supply chain risk). Fixed npm audit vulnerabilities (defu prototype pollution, brace-expansion ReDoS). Added Dependabot PR skip for Docker builds. | — | #151, #152 |

## Planned

- [**#136** — Upgrade TypeScript 5.9 → 6.0](ideas.md#upgrade-typescript-59-to-60-136) — TS 6.0.2 available (on 5.9.3). Transition release before TS 7.0 (Go rewrite). Main change: add `"types": ["node"]` to tsconfig. Wait until mid-April 2026 for ecosystem stability.

## Open Issues

- [**#110** — Serving metrics: reconcile adult-only vs all-ages counts](ideas.md#serving-metrics-reconcile-adult-only-vs-all-ages-counts-110)
- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #54 / release v2026.03.18.1156 (reviewed 2026-03-18)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
