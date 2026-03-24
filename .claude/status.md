# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `.claude/sessions/`.

**Last updated**: 2026-03-23

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-03-23 | **Use nickname on contact logs + timezone fix**: Session name uses MP Contact Nickname; contact log dates now correctly convert to Central Time in the service layer (was using server-local/UTC). Fixed ambiguous `Contact_ID` column in login query. | #129 | #130 |
| 2026-03-23 | **Fix cache stale-while-revalidate**: Changed `revalidateTag({expire:0})` → `updateTag()` so dashboard and contact cache refreshes serve stale data instantly instead of causing 20-30s cold misses. | #124, #125, #127 | TBD |
| 2026-03-23 | **Contact card: age/grade badges & household positions**: Violet badges for minor children's age/grade groups; household position labels under each member. | — | #126 |
| 2026-03-18 | **Auto contact logging**: Clicking email/phone/text/directions or copying email/phone/address on contact card auto-creates a Contact Log entry. | #121 | #120 |
| 2026-03-18 | **CI: npm audit step** + **Dependabot security alerts** enabled. Added `npm audit --audit-level=high` to Docker build workflow. | — | — |
| 2026-03-18 | **Dependency updates**: 8 packages updated (tailwindcss 4.2.2, recharts 3.8.0, @vitejs/plugin-react 6.0.1, etc). Fixed recharts Tooltip type. | — | #119 |
| 2026-03-18 | **Upstream PR #54**: Incorporated dependency updates + security fixes. 10 version pin bumps, 0 audit vulnerabilities, Next.js 16.1.7, better-auth 1.5.5. | — | — |
| 2026-03-17 | **Contact card close button**: Added "X" button to top-right of contact detail card to return to search. | #116 | — |

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
