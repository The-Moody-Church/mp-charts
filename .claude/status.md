# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `.claude/sessions/`.

**Last updated**: 2026-03-18

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-03-18 | **Auto contact logging**: Clicking email/phone/text/directions or copying email/phone/address on contact card auto-creates a Contact Log entry. | #121 | #120 |
| 2026-03-18 | **CI: npm audit step** + **Dependabot security alerts** enabled. Added `npm audit --audit-level=high` to Docker build workflow. | — | — |
| 2026-03-18 | **Dependency updates**: 8 packages updated (tailwindcss 4.2.2, recharts 3.8.0, @vitejs/plugin-react 6.0.1, etc). Fixed recharts Tooltip type. | — | #119 |
| 2026-03-18 | **Upstream PR #54**: Incorporated dependency updates + security fixes. 10 version pin bumps, 0 audit vulnerabilities, Next.js 16.1.7, better-auth 1.5.5. | — | — |
| 2026-03-17 | **Contact card close button**: Added "X" button to top-right of contact detail card to return to search. | #116 | — |
| 2026-03-16 | **Contact search: wait for Enter**: Removed debounced search-as-you-type that caused laggy flashing results. Search now fires on Enter/click only. | #112 | — |
| 2026-03-16 | **Stable cache keys**: Changed dashboard cache keys from today's date to end-of-ministry-year (Aug 31) so they're stable all year. Eliminates daily cold cache at midnight. Service methods cap month iteration at today to avoid wasted API calls. | #113 | #114 |
| 2026-03-15 | **Concurrency control**: Added `mapWithConcurrency` (limit 6) to monthly attendance API calls. Prevents 55+ parallel requests from overwhelming MP API. | — | — |
| 2026-03-14 | **Dashboard cache fix**: Removed redundant `dateIso` from cache keys; fixed `new Date()` PPR error. | #108 | #111 |
| 2026-03-14 | **Dashboard polish**: Feed Your Soul rewrite, Know God 4-col metrics, Grow in Love descriptions + "Other" bucket, removed Period Comparison. | #52 | #109 |
| 2026-03-13 | **Feedback → GitHub issues**: Replaced MP Feedback_Entries with GitHub issue creation. | #104 | — |
| 2026-03-12 | **Contact lookup improvements**: Owner-only log editing (#96), null safety (#99), search scoring (#98), badge improvements (#92-94), address + directions (#88), venn fix (#83) | #83-99 | #89-101 |

## Open Issues

- [**#110** — Serving metrics: reconcile adult-only vs all-ages counts](ideas.md#serving-metrics-reconcile-adult-only-vs-all-ages-counts-110)
- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)
- [**#57** — IDOR mitigation (per-record authorization)](ideas.md#idor-mitigation-per-record-authorization-57)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #54 / release v2026.03.18.1156 (reviewed 2026-03-18)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
