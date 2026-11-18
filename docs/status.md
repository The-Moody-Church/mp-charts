# Project Status

Quick-reference snapshot of current project state. Read this first at session start. For full details on any item, see the relevant session summary in `docs/sessions/`.

**Last updated**: 2026-11-18

## Recently Completed

> Retention note: rows older than 7 days are pruned per `.claude/rules/context-management.md`, except the
> 2026-06-2x rows, which are kept deliberately — no session summaries exist for 2026-06-23/24 or 2026-07-10,
> so these are the only in-repo record that #190/#191/#192 shipped.

| Date | Work | Issues | PR |
|------|------|--------|---|
| 2026-11-18 | **Upstream `75d249d..aa1bc64` reviewed; audit LOW items planned; #297 accepted.** 50 per-commit/per-finding entries with evidence in `.claude/plans/open-items-2026-11-18.md`, logged in `upstream-sync-log.md`, sequenced as PR batches (1 headers/proxy, 2 auth core, 3 MP client, 4 contact logs, 5 tool-page gates, 6 auth UI, 7 session cookie, 8 401 retry, 9 tooling/deps, 10 CI). Owner decisions: port the lazy id_token verifier, keep silent re-sign-in, `jwe` cookie cache, MIT LICENSE (added). #297 closed as accepted with measurements (skipping the proxy for bodied requests only moves the cost to Next's 20 MB form-action decode) | #297 | — |
| 2026-11-18 | **Admin tool actions hardened; ministry year rolls over on Central time** (#307, #308). Journey and compliance tool save/delete now apply the `write` rate limit, save the Zod-parsed (key-stripped) config instead of the caller's object, and clear the processing-service cache straight after the config write, so a failed feature-access step no longer leaves the old config cached. `getDashboardRange()` reads the month on the Central calendar, so the dashboard's five-year range and cache keys roll over at midnight Central on Sep 1, not 19:00 CDT on Aug 31. 14 new or inverted admin tests fail on the old actions; the range tests run under five process zones. No soak (admin-only, and a once-a-year boundary) | #307, #308 | — |
| 2026-11-17 | **Dashboard keeps its last good data when an MP read fails** (#304, #306). All 11 `dashboardService.ts` readers log and rethrow instead of returning empty data, so a failed background refresh or warm no longer replaces cached charts with zeros for 6h; the aggregators stay all-or-nothing. Activity_Log and monthly attendance months are capped at 6 in flight and any failed month rejects. `serviceCache` warns on a failed refresh. Refresh marks entries (`markForRefresh`) instead of deleting them and the shell keeps what fails, with an inline message; failed extended/engagement stages say "could not be loaded"; a warm with failed entries retries after 1/3/5 min. Start/end spans merge into disjoint spans in any row order (#306, `dashboard-spans.ts`). Soaked on `:dev` 2026-11-18 | #304, #306 | #310 |
| 2026-11-17 | **Dashboard counts services on the last day of a month** (#305). Every `dashboardService.ts` date filter is now half-open on MP wall-clock day strings via the new `mp-date-range.ts` (`>= start AND < day after end`), so Aug 31 / Nov 30 / May 31 services, Aug 31 milestones and activity are no longer dropped; the browser filter compares day strings too, and bucket keys are sliced from the MP string (no zone dependence); small-group months no longer skip from a 31st start; the today cap uses Central time. Callers and cache keys unchanged. Soaked on `:dev` 2026-11-18 | #305 | #310 |
| 2026-11-17 | **Tests for dashboardService and the dashboard/admin actions** (#302). Six new test files (~300 tests): `dashboardService.ts` from no test to 99.8% statements, and the three actions files to 100%. All were mutation-tested (134 mutants killed, 3 equivalent survivors). Project coverage is 54.1% (from 45.3%); thresholds raised to 54/45/44/55. The tests surfaced 13 confirmed source bugs, now in ideas.md: **the dashboard caches empty data when one MP read fails** (9 methods break caching.md's rule), **services on the last day of a month are left out**, **row-order-dependent dedup undercounts active people** (all medium), admin action hardening and the ministry year rolling over on UTC (low). No source change in this PR | #302 | #303 |
| 2026-11-17 | **Coverage measures the whole project** (#212). `vitest.config.ts` sets `coverage.include` (`src/**/*.{ts,tsx}` + `scripts/audit-gate-lib.mjs`), so untested files count as 0% instead of disappearing: the old config reported 60.56% statements over 130 files, the true figure is 45.27% over 217. `coverage.thresholds` (45/40/38/46) fail `npm run test:coverage` on a drop (local only; CI runs `test:run`). Biggest gaps: `dashboardService.ts` (no test), the admin tool actions, `dashboard/actions.ts` (new ideas.md entry) | #212 | #301 |
| 2026-06-24 | **Security review + top-3 fixes**: 15-dimension adversarial audit (report: `.claude/notes/security-audit-2026-06-23.md`; 23 confirmed / 27 refuted). Fixed: new `sanitizeId()` routed through every single-value numeric `$filter` sink (contact-log/journey/compliance/summer-blast) closing OData filter injection (F1) + added missing `top` cap; `deleteContactLog` ownership check (F3); user-profile actions bound to session GUID (F4); open-redirect backslash bypass in `signin` + `security.md` snippet (F5); F2 (cross-participant scope) since completed — the per-record scope check shipped and now runs in `enforce` mode in production (`F2_SCOPE_ENFORCEMENT=enforce`). 517 tests pass, lint clean. | — | #190, #191, #192 |
| 2026-06-23 | **@babel/core bump + lint cleanup**: Bumped @babel/core 7.29.0→7.29.7 (LOW sourceMappingURL file-read) — Dependabot board now fully clear. Resolved all pre-existing eslint errors/warnings: render-time pagination reset in `contact-lookup-results` (was setState-in-effect), consolidated client-only platform detection in `install-prompt`, `let`→`const`, removed dead imports, and eslint config (ignore `coverage/`, honor `_`-prefix, allow `require()` in `cache-handler.js`). `npm run lint` now 0 problems; build + 509 tests pass. | — | #184 |
| 2026-06-23 | **Dependabot security cleanup**: Cleared all open security alerts. Bumped undici 7.24.4→7.28.0 + vite 8.0.5→8.1.0 (3 HIGH: SOCKS5 cross-origin routing, TLS-bypass, `server.fs.deny` Windows bypass), esbuild 0.27.3→0.28.1 (low), js-yaml 4.1.1→4.2.0 (MEDIUM YAML-merge DoS), and added a `postcss: "$postcss"` override to dedupe Next 16's exact-pinned 8.4.31 nested copy to the patched 8.5.15 (MEDIUM CSS-stringify XSS). 0 high / 0 critical remaining; `next build` + 509 tests pass. | — | #181, #180, #183 |

## Open Security Findings

- The 2026-10-10 audit (`.claude/notes/security-audit-2026-10-10.md`): **N1** and **N23** fixed in #251; **N5** and **N6** closed and **N2–N4, N7** fixed 2026-10-27. The audit's MEDIUM and HIGH findings are all closed. N15 confirmed fixed and N8 reviewed 2026-11-18; LOW items N9–N14, N16–N19 are planned as PR batches in `.claude/plans/open-items-2026-11-18.md`.
- The better-auth 1.6 redirect URIs were removed from TM.Widgets on 2026-10-27 (probe: old five refused, new five accepted). The obsolete `docker-compose.rollback-1.6.yml` pins were deleted the same day.
- The audit allow-list has one entry since 2026-11-17 (#309; ported to event-manager #90, mp-senior-care #251, music-tools #204).
- **Audit gate blocked deploys 2026-11-17, resolved the same day** (all four repos): GHSA-fc5q-39xc-vjpf, picomatch <=4.0.7
  ReDoS, HIGH, no patched release (GitHub-reviewed 15:56 UTC that day). Dev tooling only (vitest, vite, eslint); the
  image ships no npm picomatch. A plain allow-list entry is refused: better-auth's optional peer `vitest` puts it in
  `npm audit --omit=dev`. **Fixed** by a gate change, `production_via_optional_peer`, proves from the
  lockfile that picomatch reaches production only through better-auth > vitest, plus the typescript-eslint 8.73.0
  bump, and a post-build check (`npm run check:standalone`, CI `verify` + Dockerfile) that no npm file outside that
  graph ships. mp-charts first, then the other three. See `docs/sessions/session-summary-2026-11-17.md`.

## Planned

- Nothing scheduled.

## Open Issues

- [**#110** — Serving metrics: reconcile adult-only vs all-ages counts](ideas.md#serving-metrics-reconcile-adult-only-vs-all-ages-counts-110)
- [**#72** — Dashboard subpages per journey step](ideas.md#and-more-specific-dashboard-subpages-72)
- [**#161** — student leaders](https://github.com/The-Moody-Church/mp-charts/issues/161)

## Key Architecture Notes

- Next.js 16 with PPR/Cache Components, Better Auth, Zod v4
- Upstream sync: reviewed through `aa1bc64` (#98–#107) 2026-11-18, ports in progress as batches; see `.claude/notes/upstream-sync-log.md`
- Docker CI/CD via GitHub Actions → GitLab Container Registry
- All processing features (volunteer, baptism, membership) use shared components in `src/components/processing/`
- RBAC: Admin-managed feature-to-User-Group mapping via `data/feature-access.json` + `ADMIN_USER_GROUP_IDS` env var; server actions enforce via `requireFeatureAccess()`; admin page at `/admin`
- PR merge strategy: always use merge commits (`--merge`), never squash
