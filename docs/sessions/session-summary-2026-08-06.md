# Session Summary — 2026-08-06

## Objectives

Review the open PRs, Dependabot alerts and security findings on GitHub, then resolve all of them.

Starting state: **17 open Dependabot alerts** (4 high, 13 medium), one stale Dependabot PR (#193, open
since 2026-07-28), no code scanning, secret scanning disabled.

## The finding that reframed the task

**The deploy pipeline was already dead.** `build-scan-and-push` runs `npm audit --audit-level=high`
*before* the Docker build, and it was exiting `1` on 6 high advisories. Any push to any branch failed
CI, produced no image, and `:latest` never moved. Production had been frozen on the 2026-07-10 image
(main `7283553`) for 27 days. The same gate already failed the #190 merge (run `29100942793`), fixed
same-day by #191.

That made the fix all-or-nothing: clearing 4 of 5 highs still exits 1, still produces no image.

## Key Decisions

- **next 16.3.0, not the 16.2.12 in PR #193.** 16.3.0 pins `sharp ^0.35.3` where 16.2.12 still pins
  `^0.34.5`, so it clears alert #44 natively instead of forcing an override to a version Next doesn't
  declare support for. Two research agents argued the other way, citing 16.3.0's Cache Components work
  (*"include deployment id in cacheHandlers keys"*) as a threat to the custom `cache-handler.js`.
  **Verified directly and the objection did not hold**: the handler treats `cacheKey` as an opaque map
  key and never parses it; both private deep imports (`dist/server/lib/lru-cache`,
  `dist/server/lib/incremental-cache/tags-manifest.external`) still resolve and export the same
  symbols in 16.3.0; and `cache-handlers/types.d.ts` is **byte-identical** between 16.2.6 and 16.3.0.
  The real risk in that file was always the deep imports — which survive — not the key format.
- **No npm overrides added.** Eight of the seventeen alerts needed no `package.json` change at all —
  the patched versions were already in-range for their parents, just stale in the lockfile. A plain
  `npm update` resolved them. The `overrides` block is unchanged.
- **postcss floor set to `^8.5.23`, resolving to 8.5.26.** The alert cites 8.5.18 as patched, but that
  is not sufficient — GHSA-fxqj-rqcc-2cmp (an incomplete-fix follow-up) covers `<=8.5.22`. The floor
  matters specifically because the existing `"postcss": "$postcss"` override propagates the root range
  to every transitive copy, so a `^8.5.12` floor would let the vulnerable version back in on a clean
  install.
- **`brace-expansion@5` was silently vulnerable again.** No alert had fired yet, but the advisory range
  is now `<=1.1.17 || 4.0.0 - 5.0.8`, which overtook the 5.0.7 pin added in `8ba3166` for
  GHSA-jxxr-4gwj-5jf2. Bumped to 5.0.9. Both major lines verified present afterwards.
- **PR #193 closed, not merged.** Its `build-scan-and-push` was skipped (`if: github.actor !=
  'dependabot[bot]'`), so it had never been image-built or Trivy-scanned, and it wouldn't have cleared
  #44 anyway. Matches the existing #182 → #183 precedent.
- **Test type fixes committed separately and first**, so each commit is independently sound.
- **New lint rules scoped to `warn`, not fixed here.** Deliberately kept a behavior-affecting component
  refactor out of a security bump; tracked in `docs/ideas.md` and slated for an immediate follow-up PR.

## Two things the upgrade surfaced

1. **Next 16.3.0 widens `next build`'s type-check scope to include test files.** 16 latent type errors
   in three test files — already failing `npx tsc --noEmit` on `main` — had never been caught because
   16.2.6's build didn't look at them. Verified by building a clean `main` worktree: baseline build
   exits **0** with 0 errors surfaced; the same tree on 16.3.0 exits **1** with all 16. All were mocks
   whose shapes had drifted from the real types (MP snake_case vs provider camelCase, `programId: null`
   against `programId: number`, an untyped generic `getTableRecords` call). No production code touched.
2. **`eslint-plugin-react-hooks` 7.1** (via `eslint-config-next` 16.3.0) adds React Compiler rules that
   flag 19 pre-existing violations — 18 × `set-state-in-effect` across 14 processing/admin components,
   plus 1 `immutability` error and 1 `incompatible-library` warning.

## Behavior change to watch after deploy

16.3.0 **silently** defaults `experimental.cachedNavigations` to `true` whenever `cacheComponents` is
enabled (it is). `'use cache'` output is retained in browser memory across client-side navigations with
a client-router-enforced ~30s minimum stale time. Not opt-in, and not reported through
`configuredExperimentalFeatures`. App Shells / Partial Prefetching remain opt-in and are unaffected.

## Advisory triage — which of the 8 next CVEs actually matter here

| Advisory | Applicable? | Why |
|---|---|---|
| GHSA-m99w-x7hq-7vfj (DoS, Server Actions) | **YES** | App Router + 17 files with `'use server'`. No workaround but upgrading. |
| GHSA-955p-x3mx-jcvp (endpoint disclosure) | partial | Recon only — every server action calls `requireSession()` |
| GHSA-p9j2-gv94-2wf4 (SSRF in rewrites) | no | `next.config.ts` defines no `rewrites()`/`redirects()` |
| GHSA-6gpp-xcg3-4w24 (proxy bypass) | no | Requires a single `config.i18n.locales` entry; no `i18n` key |
| GHSA-89xv-2m56-2m9x (SSRF, custom server) | no | `output: standalone` + `node server.js` is the Next-generated server |
| GHSA-q8wf-6r8g-63ch (image opt SVG DoS) | no | No `images` config; all six `<Image>` sites are `unoptimized` |
| GHSA-68g3-v927-f742 / GHSA-4633-3j49-mh5q | no | Need `fetch(new Request(init), otherInit)`; zero occurrences |

## Files Changed

- **Modified**: `package.json` — `next` `^16.2.3`→`^16.3.0`; `postcss` `^8.5.12`→`^8.5.23`. `overrides`
  untouched.
- **Modified**: `package-lock.json` — the above plus the `npm update` sweep (undici 7.29.0,
  js-yaml 4.3.1, brace-expansion 1.1.18 + 5.0.9, postcss 8.5.26, sharp 0.35.3, nanoid 3.3.17).
- **Modified**: `next-env.d.ts` — picks up 16.3.0's `root-params.d.ts` reference.
- **Modified**: `src/auth.test.ts` — supplied the type argument to two generic `getTableRecords` calls.
- **Modified**: `src/lib/authorization.test.ts` — cast the `userService` mock past the full class shape;
  `programId: null` → `1` (set but never asserted).
- **Modified**: `src/lib/providers/ministry-platform/helper.test.ts` — reshaped communication, message
  and file-param mocks to `CommunicationInfo` / `MessageInfo` / `FileUploadParams` / `FileUpdateParams`.
- **Modified**: `eslint.config.mjs` — `react-hooks/set-state-in-effect` and `react-hooks/immutability`
  scoped to `warn` with a pointer to the ideas.md entry.
- **Modified**: `docs/ideas.md` — added a completed Technical Debt entry for this work and an incomplete
  one for adopting the React Compiler rules. Drive-by: fixed the IDOR entry, which read `✅ CLOSED`
  instead of `✅ COMPLETED` and so parsed as *incomplete*, making the sync workflow re-update issue #122
  on every run.
- **Modified**: `docs/status.md` — new 2026-08-06 row; fixed the stale `PR #190 (pending)` cell and the
  no-longer-true `SECURITY TODO(F2)` clause; upstream-sync line `#55 / 2026-04-08` → `#66 / 2026-07-10`.
  Kept the 2026-06-2x rows against the 7-day retention rule (noted inline) — no session summaries exist
  for those dates, so they are the only in-repo record that #190/#191/#192 shipped.
- **Created**: `docs/sessions/session-summary-2026-08-06.md`.

## Verification

| Check | Before | After |
|---|---|---|
| `npm audit --audit-level=high` (the CI gate) | exit **1**, 6 high | exit **0**, 0 vulnerabilities |
| `npx tsc --noEmit` | 16 errors | **0** |
| `npm run lint` | 0 problems (19 errors once 7.1 rules landed) | exit 0, 0 errors / 20 warnings |
| `npm run test:run` | 533 | **539 passed**, 35 files |
| `npm run build` | 0 (didn't check test files) | **0** |
| standalone payload | next 16.2.6 / sharp 0.34.5 | **next 16.3.0 / sharp 0.35.3** |

Cache-handler pre-flight (`lru-cache` + `tags-manifest.external` imports resolve, all three symbols
present): passes.

## Status

**BLOCKED ON GITHUB** — all three PRs are open; none can be verified or merged.

GitHub Actions went into an incident at 15:22 UTC (partial outage, later escalated to **major
outage**) — *"Some workflow runs are still delayed or failing to complete."* Both CI runs on
`fix/deps-security-2026-08` sat queued and were auto-cancelled after exactly 15 minutes with
`runner_name: ""` and `steps: []` — **the jobs never got a runner**. Nothing to do with the branch.
Dependabot PR #193 closed as superseded.

| PR | Branch | Base | State |
|---|---|---|---|
| [#194](https://github.com/The-Moody-Church/mp-charts/pull/194) | `fix/deps-security-2026-08` | `main` | open, CI blocked |
| [#195](https://github.com/The-Moody-Church/mp-charts/pull/195) | `chore/ci-verify-dependabot-prs` | #194 | open, stacked |
| [#196](https://github.com/The-Moody-Church/mp-charts/pull/196) | `chore/dependabot-grouping-and-scanning` | #195 | open, stacked |

#195 and #196 are **stacked deliberately**: #195 adds a `verify` job that runs
`npm audit --audit-level=high`, which does not pass on current `main`. Retarget each down the chain
as its parent merges.

## Remaining work

1. **Verify + merge the stack** once Actions recovers. The one gate that cannot be reproduced locally
   is **Trivy on the real image** — `next` and `sharp` do ship inside `.next/standalone/node_modules/`,
   so Trivy sees them.
2. **Deploy** — `:dev` soak then `:latest`. There is no separate staging container: `/deploy-dev` swaps
   the tag on the container serving live production traffic, so it needs a short announced window.
   Never `docker compose down -v` (destroys the `data` volume holding `feature-access.json` / RBAC).
   Roll back to digest `sha256:e772b28f…` or tag `:72835533cb3190669e5d93fc6016ed0a1f3ffae0`.
3. **React Compiler rules** — refactor the 19 flagged patterns, then restore both rules to `error`.
   Should branch from a merged `main`, not stack a 14-file refactor four deep.
4. **Secret scanning** — enable Secret Protection + push protection in repo Settings. UI-only; #196
   cannot do it from a workflow file.
