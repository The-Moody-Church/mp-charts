# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `.claude/sessions/`.

**Last updated**: 2026-02-26

## Recently Completed

| Date | Work | Issues | Session |
|------|------|--------|---------|
| 2026-02-26 | Processing search bar + non-exclusionary volunteer groups | #49, #50 | [session](sessions/session-summary-2026-02-26.md) |
| 2026-02-25 | Mobile & responsive improvements (30+ files) | #13, #33 | [session](sessions/session-summary-2026-02-25.md) |
| 2026-02-24 | Shared processing components extraction + security audit | #60 | [session](sessions/session-summary-2026-02-24.md) |
| 2026-02-23 | Baptism processing + membership processing | #17, #47 | [session](sessions/session-summary-2026-02-23.md) |

## Open Issues

- **#52** — Active Communities and Small Groups chart needs work
- **#57** — IDOR mitigation (per-record authorization)
- **#58** — Role-based access control (RBAC)
- **#15** — Small Group Trends chart visualization improvements
- **#19** — Pastoral interface for contact logs

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync current through PR #42 (reviewed 2026-02-20)
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
