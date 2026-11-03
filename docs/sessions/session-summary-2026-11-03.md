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

## Follow-ups
- event-manager and music-tools carry UI behaviour changes and were not soaked: a quick click-through
  is worthwhile (checklists in #79, #191).
- TypeScript 7 (#269, music-tools #168) research; eslint 10 (#262) still blocked on plugin peers.
