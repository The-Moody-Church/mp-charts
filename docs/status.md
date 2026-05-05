# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-05-05

## Recently Completed

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-05-05 | **Contact lookup: Groups section + sectioned compliance cards**: Added a "Groups" section to the contact lookup detail page that lists every active Group_Participant for the contact (clickable via the In a Group / Serving badges, lazy-loaded). Compliance cards now split the checklist into Requirements vs Milestones sections. | #162, #163 | (pending) |
| 2026-05-04 | **CI: bump trivy-action v0.35.0 → v0.36.0**: clears Node.js 20 deprecation warning (v0.36.0 uses `actions/cache@v5.0.5` on Node 24). | — | (pending) |
| 2026-05-04 | **Security: bump postcss 8.5.8 → 8.5.10** (dependabot): fixes GHSA-qx2v-qp2m-jg93 / CVE-2026-41305 (XSS via unescaped `</style>`, medium). Transitive dev dep. | — | #166 |
| 2026-05-04 | **Fix: require Program when journey is attached to compliance tool**: Stillson tool was saved with `journeyId` + `journeyMilestones` but `programId: null`, which left the Mark Complete button disabled for journey milestones. Added Zod `.refine()` + editor-side validation so the misconfig can't slip through again. | — | (pending) |

## Planned

- [**#136** — Upgrade TypeScript 5.9 → 6.0](ideas.md#upgrade-typescript-59-to-60-136) — TS 6.0.2 available (on 5.9.3). Transition release before TS 7.0 (Go rewrite). Main change: add `"types": ["node"]` to tsconfig. Wait until mid-April 2026 for ecosystem stability.

## Open Issues

- [**#110** — Serving metrics: reconcile adult-only vs all-ages counts](ideas.md#serving-metrics-reconcile-adult-only-vs-all-ages-counts-110)
- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)
- [**#161** — student leaders](https://github.com/The-Moody-Church/mp-charts/issues/161)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #55 (reviewed 2026-04-08)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
