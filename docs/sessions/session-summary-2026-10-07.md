# Session Summary — 2026-10-07

## npm audit gate with a narrow allow-list — COMPLETED (branch `chore/audit-gate-exception-2026-10-07`, [#248](https://github.com/The-Moody-Church/mp-charts/pull/248), not merged)

### Why

GHSA-vfj7-8cjw-p6xm (braces, HIGH, stack-exhaustion DoS through deeply nested patterns) was
published today. It affects **every** braces release (≤ 3.0.3) and no patched version exists. Here it
arrives only through the lint toolchain:

```
eslint-config-next → @next/eslint-plugin-next (16.3.x / 16.4.0 pin fast-glob 3.3.1)
  → fast-glob → micromatch → braces
```

All five are devDependencies: `npm audit --omit=dev` on `main`'s lockfile does not report them. The
production image's runner stage copies only `.next/standalone` (+ `static`, `public`), and a local
`next build` of this branch shows none of braces, micromatch, fast-glob, eslint,
`@next/eslint-plugin-next` or source-map-js under `.next/standalone/node_modules`; sharp (0.35.5) is
the only one of these packages that ships.

`npm audit --audit-level=high` — the CI `verify` gate and the nightly audit — failed on every build
with nothing to upgrade to, so no image could ship. `main` also carried two fixable HIGHs:
GHSA-wq5f-xc86-pv6w (sharp < 0.35.5, librsvg; sharp **is** in the image) and GHSA-68fv-2mgg-jv7q
(source-map-js 1.0.0–1.2.1).

Decision (owner): a **narrow exception** for this one advisory only; every other HIGH/CRITICAL must
still fail. `npm audit fix` was rejected: tried in the sibling apps today, it left five HIGHs and
introduced new lint errors, and `--force` would install `eslint-config-next@14`.

### What changed

- **`scripts/audit-gate-lib.mjs`** (new, pure ESM, `// @ts-check`) — `evaluateAudit(auditJson,
  allowlist, today)` → `{ violations, allowed, staleEntries, overdueEntries }`. Only high/critical are
  gated; each vulnerability is resolved to its root advisories through `via` (objects are advisories,
  GHSA id from `url`/`source`; strings recurse; cycles guarded); it is allowed only if every root is
  allow-listed by GHSA id **and** package, with at least one root and nothing unresolvable. Also
  `productionExposedEntries(prodAuditJson, allowlist)` (the dev-only check, below),
  `parseAuditOutput`, `redactUrlCredentials`, `runGate` (I/O injected) and annotation formatting.
- **`scripts/audit-gate.mjs`** (new) — runs `npm audit --json --offline=false --include=dev
  --include=optional --include=peer` via `spawnSync`, retries the `audit endpoint returned an error`
  case (3 attempts, 30 s apart — the semantics of the retry loop in mp-senior-care's step), and
  fails (exit 2) if it persists, on non-report output, or on an invalid allow-list. Notices for
  allowed findings (with the reason), warnings for overdue/stale entries, errors for violations
  (package, severity, advisory URLs); exit 1 on any violation. While an entry is in use it then runs
  `npm audit --json --offline=false --omit=dev --include=optional --include=peer` through the same
  retry / fail-closed path, and exits 1 if an allow-listed advisory appears in the production tree.
- **`scripts/audit-allowlist.json`** (new) — the single braces entry, `added` 2026-10-07,
  `review_by` 2026-11-07.
- **`scripts/audit-gate-lib.test.ts`** (new, 61 tests) + **`vitest.config.ts`** `include` gains
  `scripts/**` (it only covered `src/**`; confirmed with `vitest list`). The "CI wiring" tests find
  the workflows rather than naming them, so the same file runs in event-manager (no nightly).
- **Workflows** — the "Audit npm dependencies" step in `docker-build-push.yml` (`verify`) and
  `audit-nightly.yml` now runs `node scripts/audit-gate.mjs`. Step names unchanged; parsed YAML is
  otherwise identical to `main` (comments aside).
- **Lockfile only** — `npm update sharp source-map-js`: sharp 0.35.4 → 0.35.5 (+ its 26 `@img/*`
  optional platform packages) and source-map-js 1.2.1 → 1.2.2. `package.json` unchanged; both within
  existing ranges (next 16.3.8's `optionalDependencies` allows `sharp ^0.35.4`).
- **Docs** — `.claude/rules/security.md` (CI section: the gate, the exception, how to add/remove an
  entry, `review_by`), `CLAUDE.md` (Node runtime note), `.claude/commands/audit-deps.md`,
  `docs/status.md` (new row; 7-day retention applied: the 2026-09-24 → 2026-09-29 rows dropped —
  they remain in git history and their session summaries), and the `verify` step's comment.

### Decisions

- **Fail closed everywhere.** A mixed-root vulnerability (allow-listed advisory + any other) fails;
  so does a `via` name with no entry, an advisory with no GHSA id, an empty `via`, a cycle with no
  advisory, an unknown severity, and a report whose `metadata` counts disagree with its entries.
  Overdue and stale entries only warn, so a forgotten review date cannot freeze deploys on its own;
  the nightly run surfaces them.
- **Pinned npm flags.** Measured with npm 11.19: an `.npmrc` with `offline=true` makes plain
  `npm audit` print a clean report and exit 0 (the old gate had the same hole); `omit=dev` drops the
  devDependency tree. `--offline=false` and `--include=…` override both.
- **"Stale" means the advisory appears nowhere in the report, at any severity** — the dependency was
  fixed or removed and the entry can go.
- **Dev-only is enforced, not just stated** (review finding P1). Each entry's reason says the
  advisory stays out of production, but the first version matched on GHSA id + package only: in a
  scratch copy, `npm install micromatch@4.0.8 --save --package-lock-only` made braces a production
  dependency (`npm audit --omit=dev` listed braces + micromatch as high) and the gate still exited 0.
  Trivy would not catch it either (`ignore-unfixed: true`, and braces has no fix). Now an entry in
  use triggers a production-tree audit, and any allow-listed advisory there fails the gate. This goes
  past the literal spec — it is the owner's own reason for the exception, made a check — so it is
  called out in the PR for the owner to confirm. The second audit runs only when an entry is in use
  (no exception, nothing to check) and only after the first one passed.

### Review follow-ups (same day)

A cross-repo review of the three gates raised six problems. For this repo:

- **P1, production path not enforced** — applied (above): `productionExposedEntries` + the second
  audit, 9 new tests.
- **P2, the three repos' gates not identical** — this repo's files are the canonical version
  (pinned npm flags, metadata cross-check, refusal of ambiguous GHSA ids, `@ts-check`, CI-wiring
  tests). Folded in event-manager's `redactUrlCredentials` (npm's error text embeds the registry
  URL). event-manager and mp-senior-care copy `audit-gate-lib.mjs`, `audit-gate.mjs` and
  `audit-gate-lib.test.ts` byte-for-byte from commit `037c11b`.
- **P5, doc understated the rule** — applied: `.claude/rules/security.md` now says a dependency whose
  roots include the allow-listed advisory plus any other advisory, *at any severity*, fails.
- **P3** (bare `npm audit --json` in the other two runners), **P4** (stale nightly header in
  mp-senior-care) and **P6** (mp-senior-care's error message) — not applicable here: this repo
  already pins the npm flags, its nightly header was already updated, and its `parseAuditOutput`
  already reads `error.code` / `error.summary`.

### Verification

- `node scripts/audit-gate.mjs` on the branch: exit 0 — five `::notice::` lines (the braces chain),
  0 violations, then "no allow-listed advisory reaches a production dependency (npm audit
  --omit=dev)".
- Braces made a production dependency (scratch copy, `micromatch@4.0.8` in `dependencies`): exit 1,
  `::error::npm audit: allow-listed GHSA-vfj7-8cjw-p6xm (braces) now reaches a production dependency
  …`. Before the review fix the same copy exited 0.
- Same script against `main`'s `package.json` + `package-lock.json`: with `[]` as the allow-list,
  exit 1 with 7 violations (braces chain ×5, sharp, source-map-js); with this allow-list, exit 1 with
  2 (sharp, source-map-js). Against this branch's lockfile with `[]`: exit 1 with 5.
- Endpoint outage (a local stub registry returning 503): 3 attempts over ~61 s, then exit 2. With the
  first audit answered and the production audit's endpoint refused: 3 attempts, then
  `::error::npm audit --omit=dev endpoint unavailable after 3 attempts … could not verify advisories`.
- Plain `npm audit --audit-level=high` on the branch: only the braces chain (5 high) plus 2 moderate
  (postcss-selector-parser, not gated).
- Mutation check: 25 single mutations of the lib each turn the suite red — the 17 first-pass ones
  (e.g. `every` → `some` root allow-listed, dropping the unresolvable check, passing on endpoint
  exhaustion, ignoring the package match) re-run against the final version, plus 8 for the review
  changes (production check returns nothing / is skipped / matches id only / does not fail,
  `--omit=dev` dropped, production-audit outage passes, redaction removed); reverting the workflow
  wiring fails the "CI wiring" tests.
- `tsc --noEmit` clean (the lib is type-checked through the test's import); lint 0 errors /
  0 warnings, same as `main`; `npm run test:run` 1099/1099 (main 1038 + 61); `next build` and
  `check:shells` pass, and `.next/standalone/node_modules` has none of braces, micromatch,
  fast-glob, eslint, `@next/eslint-plugin-next` or source-map-js (sharp 0.35.5 only); the CI
  security-lint grep is clean; `npm ls`: better-auth 1.7.5, next 16.3.8, sharp 0.35.5,
  source-map-js 1.2.2. Parsed workflow YAML equals `main`'s except the two audit steps' `run:`.
- The review pass ran on Node 24.21.0 / npm 11.19 (the first pass on Node 26.10 / npm 11.19.1; CI uses
  Node 24's npm 11.19.0).

### Follow-ups

- By **2026-11-07**: re-check braces / `@next/eslint-plugin-next` for a fix; remove the entry or move
  `review_by` in a PR that says why.
- The same gate is going into event-manager and mp-senior-care, byte-identical to this repo's three
  gate files; `diff` them whenever one changes.
- Owner to confirm the dev-only enforcement (P1); it only makes the gate stricter.
