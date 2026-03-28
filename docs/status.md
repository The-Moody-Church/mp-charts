# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-03-28

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-03-28 | **Contact search improvements**: Active contacts filter (checkbox), removed 20-result cap with infinite scroll, engagement tie-breaking, fixed short-prefix scoring bias, auto-re-search on filter toggle. | — | #139 |
| 2026-03-26 | **Dependabot security patch**: Merged picomatch 4.0.3→4.0.4 and 2.3.1→2.3.2 (CVE-2026-33671, CVE-2026-33672). Lockfile-only. | — | #135 |
| 2026-03-26 | **Closed IDOR issue as won't-fix**: Current auth (proxy session validation + requireSession + RBAC) is satisfactory for staff-only app. | #122 | — |
| 2026-03-25 | **Custom cache handler for stale-while-revalidate**: Default Next.js in-memory handler ignores `stale` param entirely — expires at `revalidate` (6h) instead of `revalidate + stale` (30h). Created `cache-handler.js` with proper SWR support via `cacheHandlers.default` config. | #132, #133 | TBD |
| 2026-03-23 | **Use nickname on contact logs + timezone fix**: Session name uses MP Contact Nickname; contact log dates now correctly convert to Central Time in the service layer (was using server-local/UTC). Fixed ambiguous `Contact_ID` column in login query. | #129 | #130 |

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
