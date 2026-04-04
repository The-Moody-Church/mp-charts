# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-04-04

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-04-04 | **Update GitHub Actions to Node.js 24**: All workflow actions updated to latest major versions (checkout v5, buildx v4, login v4, build-push v7, github-script v8). Pinned trivy-action from `@master` to `v0.35.0` (supply chain risk). Fixed npm audit vulnerabilities (defu prototype pollution, brace-expansion ReDoS). Added Dependabot PR skip for Docker builds. | — | #151, #152 |
| 2026-04-04 | **Migrate mp-charts to TMC1**: Deployed to production server (192.168.5.222). Copied data files (feature-access, journey-tools, compliance-tools, feedback-config) from ironside to TMC1. Updated deploy command. | — | — |

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
