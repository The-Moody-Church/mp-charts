# Session Summary — 2026-08-07

## Objectives

Adopt the React Compiler lint rules that were downgraded to `warn` during the 2026-08-06 security
sweep, and restore them to `error`.

Starting state: 20 violations across 17 files — 18 × `set-state-in-effect`, 1 × `immutability`,
1 × `incompatible-library` — all pre-existing, surfaced by `eslint-plugin-react-hooks` 7.1 arriving
with `eslint-config-next` 16.3.0.

## Outcome

**Two of the three rules are done and enforced at `error`.** `set-state-in-effect` is at 16 of 18
and stays `warn` until the last site lands.

| Rule | Before | After |
|---|---|---|
| `react-hooks/immutability` | warn, 1 | **error, 0** |
| `react-hooks/incompatible-library` | warn, 1 | **error, 0** |
| `react-hooks/set-state-in-effect` | warn, 18 | warn, **16** |

Lint 0 errors, build clean, 548 tests (up from 539).

## The verification problem, and what was done about it

13 of the 14 components with `set-state-in-effect` violations have **no tests at all** — only
`user-context.tsx` does. `.claude/rules/testing.md` treats UI as integration/E2E territory, so this
is by design, but it means lint and typecheck are the only automated signal and neither proves
behavior. `npm run test:run` is a *non-signal* for this work.

Compensated with **characterization tests** — written against the current, unrefactored code and
verified passing *before* touching it, so a later failure proves the refactor is wrong rather than
proving the test is new:

- `user-context.test.tsx` +4 (pending-session, identity change A→B, no-refetch-on-rerender,
  sign-out clears profile). Existing 7 covered the happy path but none of these.
- `contact-lookup-search.test.tsx` +5, new file.

Both were **mutation-tested** rather than assumed: injecting the exact bug each guards
(`activeOnly` instead of the new value) fails the suite; reverting passes it. Used `fireEvent` from
the already-installed `@testing-library/react` rather than adding `@testing-library/user-event` —
no new dependency, no lockfile churn.

## Three findings that changed the approach

**A — the rule under-approximates, so "0 warnings" ≠ "pattern gone".** It walks only an effect's own
basic blocks and never descends into nested function expressions. `contact-logs.tsx:186` is the exact
dominant shape and lint never reported it, purely because its loader was declared *inside* the
effect. There is therefore a one-line non-fix at every remaining site: wrap the body in a nested
async function and the warning vanishes with the pattern intact. **Merge rule: reject any diff whose
only structural change is nesting depth.** That site was fixed anyway, so the count doesn't overstate
the result.

**B — dynamic segments remount.** Verified against `layout-router.js:549`: the dynamic segment's
value is part of the router cache key, so `/journey/a → /journey/b` and `/contact-lookup/[guid]`
navigation remount. This retired a proposed hand-rolled loading state machine and closed a suspected
`defaultValues` data-integrity bug that is not reachable.

**C — unresolved, gates the 5 remaining Shape 1 sites.** `cacheComponents: true` wraps segments in
`<Activity mode="hidden">`, and React destroys/recreates hidden effects — so mount fetches currently
re-run on Back-navigation. Moving those reads to Server Components seeds `useState`, and initializers
do *not* re-run on Activity restore, which would delete that refresh. Next's `staleTimes.dynamic`
defaults to `0` and `await connection()` makes these routes dynamic, which predicts Back still
refetches. Not confirmed: the app gates every route behind MP OAuth, so a local repro needs throwaway
public routes, and that stopped being worth the time. **Settle it in the end-to-end test pass.**

## Files Changed

- **Modified**: `src/components/contact-lookup/contact-lookup-search.tsx` — effect deleted; re-search
  moved into the checkbox's `onChange`; `scopeActiveOnly` is a **required** parameter.
- **Created**: `src/components/contact-lookup/contact-lookup-search.test.tsx` — 5 tests.
- **Modified**: `src/contexts/user-context.test.tsx` — +4 characterization tests.
- **Modified**: `src/app/(web)/admin/{compliance,journey}-tools/page.tsx` — RSC reads config (and
  `resolveToolNames` for journey) and passes required props.
- **Modified**: `src/components/admin/{compliance,journey}-tools/*-tools-admin.tsx` — seed state from
  props; `loading` state and its early-return deleted; loader is refresh-only.
- **Modified**: `src/components/contact-logs/contact-logs.tsx` — `watch()` → `useWatch`; mount fetch
  moved to an async continuation with a cancel guard; `isLoadingLogTypes` initialiser now `true`.
- **Modified**: `eslint.config.mjs` — `immutability` and `incompatible-library` off the downgrade
  list; the latter pinned to `error`.
- **Created**: `.claude/notes/react-compiler-lint-plan.md` — full per-site plan for the remaining 16.
- **Modified**: `docs/ideas.md`, `docs/status.md`; **Created**: this file.

## Two things caught rather than shipped

- **`error-boundaries`.** Wrapping the JSX `return` inside the exemplar's `try/catch` tripped a rule
  that had not appeared before — it would have swallowed render errors. Only the fetch is guarded
  now. This is exactly what the "no new rule may appear" gate exists for.
- **A silent behavior change.** Moving contact-logs' fetch out of the effect body dropped the
  synchronous `setIsLoadingLogTypes(true)`, so the Select would never have shown "Loading...". Lint,
  types and tests were all green on that. The initialiser now carries it.

## Ratified for the remaining Shape 1 sites

- Suspense fallback replaces the client loading block (markup is byte-identical)
- failures pass `initialError`, seeding the component's existing error state, so a load failure still
  renders the in-page Alert rather than escalating to the route error boundary
- post-mutation refresh stays a **client** refetch, not `router.refresh()`, which re-renders the RSC
  payload and can flash the Suspense fallback over the grid

## Remaining — 16 sites

Per `.claude/notes/react-compiler-lint-plan.md`: two tool editors (Shape 2 — divergent merge
semantics, the compliance `<select>` is *not* disabled, do not copy-paste between them), five detail
modals (Shape 3 — per-open `key` counter; `key={recordId}` is the obvious choice and is **wrong**,
since parents keep the record selected after close), three post-load side effects (Shape 4), and the
five remaining Shape 1 sites including `user-context` (sequence last — it gates sign-in).

Each needs characterization tests first. `set-state-in-effect` flips to `error` when the last lands.
