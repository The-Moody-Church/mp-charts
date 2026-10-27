# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-10-27

## Recently Completed

> Retention note: rows older than 7 days are pruned per `.claude/rules/context-management.md`, except the
> 2026-06-2x rows, which are kept deliberately — no session summaries exist for 2026-06-23/24 or 2026-07-10,
> so these are the only in-repo record that #190/#191/#192 shipped.

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-10-27 | **N5 closed out.** Both GitHub feedback tokens revoked by the owner, and the four production `.env` backups that held them deleted (each checked first to differ from the live file only in the feedback lines). Of the 22 public `user-feedback` issues, 5 (#116, #129, #148, #160, #162) linked to `/contact-lookup/<GUID>`; all three contacts were in the owner's own household. Each link was cut to `/contact-lookup (contact link removed)` and the original revisions deleted from the issues' edit history; a GraphQL check of `userContentEdits` finds no ID left. All 22 issues stay in this repo; the staff names in them were kept by decision | — | — |
| 2026-10-24 | **Deploy gate unblocked again: undici + zod patched, braces entry removed.** After the feedback-removal merges, main builds failed on undici GHSA-xjj6-f33q-929c (HIGH, plus two lower) and zod GHSA-mrhx-c7xc-m3w5 (HIGH, < 4.6.6). `npm update undici zod` (undici 7.30.1 / 8.12.3, zod 4.6.7). GitHub withdrew braces GHSA-vfj7-8cjw-p6xm, so `scripts/audit-allowlist.json` is now `[]` and the shared gate test checks that the id is gone. Same change in mp-senior-care #225 and event-manager #70. All four apps then deployed from main (mp-charts f7a37e8, mp-senior-care 072962f, event-manager 29ac3cc, music-tools c964d56) | — | #275 |
| 2026-10-23 | **In-app feedback feature removed (N5).** It filed GitHub issues, with the staff member's name and the page URL (a contact's GUID on contact pages), in this **public** repo. Switched off first in all four apps by removing `GITHUB_FEEDBACK_TOKEN` from each production `.env`, then deleted here: the button, `/admin/feedback`, `FeedbackService`, `feedback-config*`, and the `feedbackEnabled` plumbing in `user.ts` and the user context. The `Feedback_*` MP models are unrelated and stay. Also on 2026-10-23: next 16.4.2 adopted by mp-senior-care #222, event-manager #67, music-tools #177; Dependabot prod group #272 (react 19.3.1, Radix minors) soaked and deployed | — | this PR, #272 |
| 2026-10-21 | **N1 + N23 fix: per-record scope on compliance requirement files, related IDs bound to the scoped participant.** Requirement files now check owner scope and requirement type before listing (`getRequirementFiles`; `getRecordFiles` private). Milestone files in both services are limited to the milestones the tool shows. `getParticipantDetail` (both services) requires the contact and group-participant IDs to belong to the scoped participant (N23, new HIGH), and pause/resume require the end-dated row to be the participant's own in the group being left. The scope enumeration is shared per tool for 15 s, `enforceScope` logs `[scope:deny]` in enforce mode, and `errorForLog` closes CodeQL #10/#11/#21. 1157 tests (+58), 14 mutants caught, independent review clean | — | #251 |
| 2026-10-21 | **Next.js 16.3.8 → 16.4.2 (security), and the deploy gate unblocked.** On 2026-10-14 vercel/next.js published GHSA-2464-fhr4-w9xw (Critical, image optimizer + sharp on glibc), GHSA-673q-mjm6-r5xr (Critical, `use cache` returning typed arrays) and GHSA-p3m5-59mp-jv5r (High, Server Actions DoS), all covering ≤ 16.4.0 and fixed in 16.4.1. They existed only as repo advisories, so npm audit, the gate and Dependabot could not see them, and the nightly stayed green 10-14 → 10-20. The DoS applies here; the `use cache` RCE most likely does not (no typed arrays); the image RCE needs glibc (our runner is Alpine). `next` only: `eslint-config-next` stays on 16.3.4, because 16.4.x breaks lint in the siblings. A read-only compatibility review against the 16.3.8 and 16.4.2 dist files found no code change needed (cache handler, Server Actions key, proxy body clone, CSP nonce, better-auth); DOCKER.md updated for the stale-action 404 → 409. Also merged Dependabot #249 (vite 8.3.4), which cleared the red Nightly Audit (GHSA-587h-7wmj-h5pm, dev-only). Production had been on `28a7071` (#247) since 10-03, so this deploy also ships #248's sharp 0.35.5. tsc, lint, 1099 tests, the audit gate, build and check:shells pass. Follow-ups in ideas.md: 10–20 MB uploads truncated by the proxy's 10 MB clone; caching.md errors | — | #249, #250 |
| 2026-06-24 | **Security review + top-3 fixes**: 15-dimension adversarial audit (report: `.claude/notes/security-audit-2026-06-23.md`; 23 confirmed / 27 refuted). Fixed: new `sanitizeId()` routed through every single-value numeric `$filter` sink (contact-log/journey/compliance/summer-blast) closing OData filter injection (F1) + added missing `top` cap; `deleteContactLog` ownership check (F3); user-profile actions bound to session GUID (F4); open-redirect backslash bypass in `signin` + `security.md` snippet (F5); F2 (cross-participant scope) since completed — the per-record scope check shipped and now runs in `enforce` mode in production (`F2_SCOPE_ENFORCEMENT=enforce`). 517 tests pass, lint clean. | — | #190, #191, #192 |
| 2026-06-23 | **@babel/core bump + lint cleanup**: Bumped @babel/core 7.29.0→7.29.7 (LOW sourceMappingURL file-read) — Dependabot board now fully clear. Resolved all pre-existing eslint errors/warnings: render-time pagination reset in `contact-lookup-results` (was setState-in-effect), consolidated client-only platform detection in `install-prompt`, `let`→`const`, removed dead imports, and eslint config (ignore `coverage/`, honor `_`-prefix, allow `require()` in `cache-handler.js`). `npm run lint` now 0 problems; build + 509 tests pass. | — | #184 |
| 2026-06-23 | **Dependabot security cleanup**: Cleared all open security alerts. Bumped undici 7.24.4→7.28.0 + vite 8.0.5→8.1.0 (3 HIGH: SOCKS5 cross-origin routing, TLS-bypass, `server.fs.deny` Windows bypass), esbuild 0.27.3→0.28.1 (low), js-yaml 4.1.1→4.2.0 (MEDIUM YAML-merge DoS), and added a `postcss: "$postcss"` override to dedupe Next 16's exact-pinned 8.4.31 nested copy to the patched 8.5.15 (MEDIUM CSS-stringify XSS). 0 high / 0 critical remaining; `next build` + 509 tests pass. | — | #181, #180, #183 |

## Open Security Findings

- The 2026-10-10 audit (`.claude/notes/security-audit-2026-10-10.md`): **N1** and **N23** fixed in #251, **N5** closed 2026-10-27; **N2–N4, N6, N7** still open (per-record scope on member milestone files, the shared photo upload and the Summer Blast writes; internal hostnames in old session summaries).
- Owner step: remove the better-auth 1.6 redirect URIs from TM.Widgets (due since 2026-10-02), then retire the `docker-compose.rollback-1.6.yml` pins.
- The audit allow-list is empty (`[]`) since 2026-10-24.

## Planned

- [**#136** — Upgrade TypeScript 5.9 → 6.0](ideas.md#upgrade-typescript-59-to-60-136) — TS 6.0.2 available (on 5.9.3). Transition release before TS 7.0 (Go rewrite). Main change: add `"types": ["node"]` to tsconfig. Out of date: TS 7.0 (Go compiler) is now GA, so re-plan between 6.0.3 and 7.x.

## Open Issues

- [**#110** — Serving metrics: reconcile adult-only vs all-ages counts](ideas.md#serving-metrics-reconcile-adult-only-vs-all-ages-counts-110)
- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)
- [**#161** — student leaders](https://github.com/The-Moody-Church/mp-charts/issues/161)
- [**#136** — Upgrade TypeScript 5.9 → 6.0](ideas.md#upgrade-typescript-59-to-60-136)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync: reviewed through `75d249d` (#96, #97) 2026-09-29; `75d249d..aa1bc64` (#98–#107) not yet logged; upstream unchanged since `aa1bc64` as of 2026-10-21; see `.claude/notes/upstream-sync-log.md`
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
