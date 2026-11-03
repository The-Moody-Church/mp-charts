# Session Summary — 2026-11-03

## Sibling minor/patch groups + React Compiler lint — COMPLETED

The sibling Dependabot minor/patch groups failed lint: eslint-config-next 16.4.3 brings
eslint-plugin-react-hooks 7.1.1, whose React Compiler rules are errors. 23 pre-existing sites across
the three siblings, all fixed (owner's call: fix all now, not warn-and-track). The four rules are now
pinned to `error` in all four apps.

| Repo | PR | Replaces | Sites |
|---|---|---|---|
| mp-senior-care | #229, #230 merged as-is; #237 (`9d73faa`) | #235 | 4, all mp-charts ports |
| event-manager | #79 (`748a780`) | #76 | 6: 3 ports, 3 own (ContactCombobox, live availability, SeriesPreview) |
| music-tools | #191 (`6ca108b`) | #189 | 13: user-context port + 12 own |

- Ports from mp-charts: 967cf1f (contact-lookup-search), c0a8193 (contact-logs `useWatch`), ebaf294
  (contact-lookup-details + `household-sort.ts`), 8ea55ec (user-context tagged loads). The user-context
  port also closes a window where the previous user's profile/features were served under a new
  session; a new test fails against the old provider.
- music-tools: the paged lists now drop stale responses (an old race), and the seasonal report's
  default ministry year is computed in Central time (it used the server's UTC clock).
- New tests mutation-checked: series-preview, contact-combobox, choir-members, seasonal-calendar-report.
- Merged without a `:dev` soak (owner's call). **Deployed to TMC1 2026-11-03 ~16:05–16:09 UTC**: music-tools
  `6ca108b`, mp-senior-care `9d73faa`, event-manager `748a780`; cache warming complete, `/signin` 200 on all three.

## music-tools Node 22 → 24 — COMPLETED

music-tools #192 (`ad10817`), deployed 2026-11-03: `.nvmrc` (new, read by both workflows), three
`node:24-alpine` stages, `engines.node >=24.0.0`, `@types/node` ^24.19.2; new CLAUDE.md "Node Runtime"
section. CI resolved `.nvmrc` to 24 (v24.22.1); production runs v24.22.2, `/signin` 200. Dependabot
#170 (@types/node 26) closed. All four Better Auth apps are now on Node 24. Follow-up PR #193 adds
mp-charts' Dependabot holds on `node` and `@types/node` majors.

## TypeScript 6 now, TypeScript 7 held — COMPLETED (#285)

Branch `chore/typescript-6`. Dependabot #269 (TS 5.9.3 → 7.0.2) failed `verify` because lint crashed:
"typescript-eslint does not support TS 7.0". TS 7.0 ships no JS API; typescript-eslint's support targets
7.1 (typescript-eslint#10940, PR #12803 in review 2026-09-29; TS 7.1 in beta). So: TS 5.9.3 → 6.0.3
(the version the other three already run; tsc 0 errors before and after, no tsconfig change, lint,
1206 tests, audit gate and build pass), a Dependabot hold on TypeScript majors (as event-manager and
mp-senior-care have), #136 marked COMPLETED, and a new ideas.md entry "Adopt TypeScript 7 once
typescript-eslint supports it". music-tools gets the same hold; its #168 closes.

## music-tools Dependabot triage — COMPLETED

music-tools #198 (`198514d`): removed `react-hook-form` and `@hookform/resolvers` (never imported) and
added an ESLint-major Dependabot hold. #196 (resolvers 7) closed as superseded; #195 (ESLint 10) closed,
since eslint-config-next's plugins still cap peer eslint at 9 and its CI passed only via an npm peer
override. #194 (lucide-react 1.66) rebased onto the new main, passed CI, merged (`119dca8`). Not deployed.

## caching.md `expire` / `updateTag` (#253) — IN PROGRESS (PR open)

Branch `fix/caching-docs-member-refresh`. Re-checked both claims in the Next 16.4.2 dist:
- `cacheLife({ revalidate, stale })` without `expire` takes the default profile's `INFINITE_CACHE`
  (`use-cache-wrapper.js`: `explicitExpire ?? innerCacheStore.expire`), so the handler's expire check
  never fires. No 30h ceiling; `stale` is the client router's. Behaviour left as is, docs corrected.
- `updateTag` calls `revalidate(..., undefined)`, which the handler records as `expired: now`: the next read
  is a miss and regenerates in the foreground. `revalidateTag(tag, 'max')` is the stale-marking form.
- Found while tracing: `refreshMemberCache` (manage-members) called `updateTag('contacts-search')` without
  purging `serviceCache`, so the regenerated function got the same cached list back; the shell then cleared
  its local status overrides, so a just-moved member could show the old status. Now purges first, as
  `refreshDashboardCache` does. Two tests; removing the purge fails one.
- Files: `.claude/rules/caching.md`, `cache-handler.js` (comments), `cached-data.ts` and `cached-contacts.ts`
  (comments; also dropped "survives container restarts", which an in-memory cache cannot), `dashboard/actions.ts`
  (comment), `manage-members/actions.ts` + test.
- tsc, lint, 1208 tests pass.

## Follow-ups
- event-manager and music-tools carry UI behaviour changes and were not soaked: a quick click-through
  is worthwhile (checklists in #79, #191).
- eslint 10 (#262) still blocked on plugin peers.
