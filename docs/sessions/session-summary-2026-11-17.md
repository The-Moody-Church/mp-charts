# Session Summary — 2026-11-17

## Objective

Pick up the next follow-up from 2026-11-10: clear the minimatch alert (GHSA-g3hv-75wg-m249, moderate, dev-only) in
all four repos now that typescript-eslint has moved typescript-estree to `minimatch ^11.0.1`.

## minimatch update — BLOCKED (waiting on picomatch)

- typescript-eslint shipped the fix as **8.73.0** on 2026-11-16 (not 8.72.3). eslint-config-next takes `^8.56.0`,
  so it is a lockfile-only update. All four repos have the same path: `eslint-config-next@16.4.5` →
  `typescript-eslint@8.72.1` → `@typescript-eslint/typescript-estree` → `minimatch@10.2.6`.
- Trial in mp-charts: `npm update` of the 11 `@typescript-eslint/*` packages. Lockfile only; 11 packages
  8.72.1 → 8.73.0, minimatch 10.2.6 → 11.0.9, brace-expansion 5.0.12 → 5.0.13, ignore 7.0.14 → 7.0.16, and one new
  package, `@isaacs/nonrecursive-glob-match@1.1.0` (minimatch 11's dependency, same author). minimatch@10 gone; tsc
  and lint pass.
- **The audit gate then failed** on a new advisory, so the change was discarded rather than held on a red branch.
  Redo it with the picomatch update below, in one `npm update`.

## picomatch GHSA-fc5q-39xc-vjpf — deploys blocked in all four repos

- picomatch `<= 4.0.7`, ReDoS via single-branch repeated extglobs (`+(*)`), CVE-2026-112366, HIGH, **no patched
  version**. Published 2026-10-19, GitHub-reviewed 2026-11-17 15:56 UTC, which is when npm audit started reporting it
  (that morning's nightly audit passed). `main`'s lockfile: 13 HIGH in each repo. Every CI run now fails `verify`.
- **Production is not affected.** The running mp-charts image has no npm picomatch, vitest, vite, tinyglobby, fdir or
  micromatch. The only copy is `next/dist/compiled/picomatch` (vendored, invisible to npm audit), used by
  `match-remote-pattern` / `match-local-pattern` for `images.remotePatterns`/`localPatterns`. The globs come from
  `next.config.ts`, not from users, and the attack needs an attacker-supplied glob.
- **Why an allow-list entry doesn't work.** better-auth 1.7.18 declares `vitest` as an optional peer (for
  `better-auth/test-utils`). Since vitest is also a devDependency, the lockfile marks it `devOptional`, and
  `npm audit --omit=dev` keeps it. The gate's production-tree check therefore reports picomatch as reaching
  production. A probe with a temporary entry exited 1 ("now reaches a production dependency"). `--omit=peer` still
  leaves 5 HIGH; `--omit=optional` would also hide shipped optional packages (sharp's binaries). Per security.md
  this needs a change to the gate itself.
- **Owner's decision: wait for the upstream fix.** Five community fix PRs were opened on picomatch that day (#254,
  #257–#261), none merged. In March picomatch shipped 2.3.2 and 4.0.4 on the same day. If an urgent deploy comes
  first, change the gate instead: an opt-in allow-list field accepting one named optional-peer path
  (better-auth → vitest), checked against the lockfile, byte-identical in all four repos.
- Note that micromatch pulls picomatch 2.x (2.3.2), so the fix needs a 2.3.x release as well as 4.0.x, or
  the eslint path stays flagged.

## When picomatch ships

In each of mp-charts, event-manager, mp-senior-care and music-tools: branch, `npm update` the typescript-eslint
packages and picomatch (lockfile only, `package.json` unchanged), `node scripts/audit-gate.mjs`, tsc, lint, tests,
then a PR with a Security Review section. No `:dev` soak needed (dev tooling only).

## Files changed

- `docs/status.md` — open-findings line for the picomatch block; last-updated date.
- `docs/sessions/session-summary-2026-11-17.md` — this file.
