# Session Summary — 2026-10-07

## npm audit gate with a narrow allow-list — COMPLETED (branch `chore/audit-gate-exception-2026-10-07`)

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
  `parseAuditOutput`, `runGate` (I/O injected) and annotation formatting.
- **`scripts/audit-gate.mjs`** (new) — runs `npm audit --json --offline=false --include=dev
  --include=optional --include=peer` via `spawnSync`, retries the `audit endpoint returned an error`
  case (3 attempts, 30 s apart — the semantics of the retry loop in mp-senior-care's step), and
  fails (exit 2) if it persists, on non-report output, or on an invalid allow-list. Notices for
  allowed findings (with the reason), warnings for overdue/stale entries, errors for violations
  (package, severity, advisory URLs); exit 1 on any violation.
- **`scripts/audit-allowlist.json`** (new) — the single braces entry, `added` 2026-10-07,
  `review_by` 2026-11-07.
- **`scripts/audit-gate-lib.test.ts`** (new, 45 tests) + **`vitest.config.ts`** `include` gains
  `scripts/**` (it only covered `src/**`; confirmed with `vitest list`).
- **Workflows** — the "Audit npm dependencies" step in `docker-build-push.yml` (`verify`) and
  `audit-nightly.yml` now runs `node scripts/audit-gate.mjs`. Step names unchanged; parsed YAML is
  otherwise identical to `main` (comments aside).
- **Lockfile only** — `npm update sharp source-map-js`: sharp 0.35.4 → 0.35.5 (+ its 26 `@img/*`
  optional platform packages) and source-map-js 1.2.1 → 1.2.2. `package.json` unchanged; both within
  existing ranges (next 16.3.8's `optionalDependencies` allows `sharp ^0.35.4`).
- **Docs** — `.claude/rules/security.md` (CI section: the gate, the exception, how to add/remove an
  entry, `review_by`), `CLAUDE.md` (Node runtime note), `.claude/commands/audit-deps.md`,
  `docs/status.md` (new row; 7-day retention applied: the 2026-09-24 → 2026-09-29 rows dropped —
  they remain in git history and their session summaries).

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

### Verification

- `node scripts/audit-gate.mjs` on the branch: exit 0 — five `::notice::` lines (the braces chain),
  0 violations.
- Same script against `main`'s `package.json` + `package-lock.json`: with `[]` as the allow-list,
  exit 1 with 7 violations (braces chain ×5, sharp, source-map-js); with this allow-list, exit 1 with
  2 (sharp, source-map-js). Against this branch's lockfile with `[]`: exit 1 with 5.
- Endpoint outage (a local stub registry returning 503): 3 attempts over ~61 s, then exit 2.
- Plain `npm audit --audit-level=high` on the branch: only the braces chain (5 high) plus 2 moderate
  (postcss-selector-parser, not gated).
- Mutation check: 16 single mutations of the lib (e.g. `every` → `some` root allow-listed, dropping
  the unresolvable check, passing on endpoint exhaustion, ignoring the package match) each turn the
  suite red; reverting the workflow wiring fails the two "CI wiring" tests.
- `tsc --noEmit` clean (the lib is type-checked through the test's import); lint 0 errors /
  0 warnings, same as `main`; `npm run test:run` 1083/1083 (main 1038 + 45); `next build` and
  `check:shells` pass; the CI security-lint grep is clean; `npm ls`: better-auth 1.7.5, next 16.3.8,
  sharp 0.35.5, source-map-js 1.2.2.
- Local runs used Node 26.10 / npm 11.19.1 (CI uses Node 24's npm 11.19.0).

### Follow-ups

- By **2026-11-07**: re-check braces / `@next/eslint-plugin-next` for a fix; remove the entry or move
  `review_by` in a PR that says why.
- The same gate is going into event-manager and mp-senior-care (identical spec).
