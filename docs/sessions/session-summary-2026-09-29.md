# Session Summary — 2026-09-29

## CI concurrency + discovery-note fix (branch `chore/ci-concurrency-docs`) — COMPLETED ([#243](https://github.com/The-Moody-Church/mp-charts/pull/243))

Housekeeping, done in the same shape in all four apps that share this auth stack. No issue
involved, so `docs/ideas.md` is unchanged. Nothing deployed.

### Objective

1. Stop two merges to `main` seconds apart from racing the `:latest` image tag. Both runs built
   in parallel and whichever **finished** last retagged `:latest`; on 2026-09-25 that was the
   older commit in three of the four apps.
2. Correct the `discoveryUrl` rationale in `CLAUDE.md`, which said better-auth 1.7 fetches
   discovery "at boot" / "at container start".

### Changes

- **`.github/workflows/docker-build-push.yml`** — a workflow-level block, with a comment
  explaining it:

  ```yaml
  concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: false
  ```

  - **Keyed on workflow + ref**, so each branch is its own queue. A push to one branch never waits
    behind another branch or behind `main`. The other workflows (`audit-nightly`, `codeql`,
    `sync-issues-to-ideas`) have different names, so they are never in this group.
  - **`cancel-in-progress: false`**: a running build is never killed halfway through a push.
    GitHub keeps at most one running and one pending run per group, and a newer run cancels
    whichever run is still pending. After a burst of merges, the running build finishes, the
    newest commit builds next, and `:latest` ends on it. The commits in between show as
    cancelled and never get a `:<sha>` image. That is what we want for `:latest`. Re-running one
    of them on `main` would retag `:latest` back to the older commit, and the comment says so.
  - **`:dev` is deliberately not serialized.** Branch pushes still race `:dev` across branches.
    It is single-tenant by design, and one queue for every branch would make each push wait on
    every other branch's full build.
- **`CLAUDE.md`** (Architecture → Auth, "Load-bearing 1.7 settings"): discovery is fetched
  once, **when the auth module is first evaluated**. Under `next start`, or the standalone
  `server.js` (which calls the same `startServer`), that is the first request that loads the
  module, not container start. There is no timeout, retry or re-fetch, and one failure disables
  sign-in until restart. Decision unchanged: we still configure the endpoints explicitly.
  `.claude/notes/upstream-sync-log.md` already said "at module load", so it is left alone. The
  2026-09-25 status row's "boot-time discovery" is a history row and is also left alone.
- **`docs/status.md`**: a 2026-09-29 row, and the 7-day retention rule
  (`.claude/rules/context-management.md`: "When adding a new entry, remove any entries older than
  7 days") applied, which this branch's first draft had skipped. 22 rows dated 2026-05-14 →
  2026-09-15 are dropped (66 → 44 lines). Every dropped date has a session summary, except
  2026-08-12/13, whose work is recorded in the 2026-08-11 summary ("Post-series: Finding C
  resolved — 2026-08-13") and in `react-compiler-lint-plan.md` ("COMPLETE (2026-08-12)"). The
  three 2026-06-2x rows stay, as the Retention note has always said. That note's "the next-newest
  is 2026-06-24" clause was stale (rows now run to 2026-09-29) and is replaced with a statement of
  what is pruned and what is kept. Its #190/#191/#192 rationale is unchanged, and
  `session-summary-2026-08-06.md` still confirms it. "Upstream sync current through PR #66
  (reviewed 2026-07-10)" was already stale on `main` (the sync log has reviews through
  2026-09-24), and dropping the 2026-09-01 "Upstream review #67–#78" row would have left nothing
  contradicting it. It now points at `.claude/notes/upstream-sync-log.md` instead of naming a
  date that goes stale.

### Verification

- Checked that no startup code evaluates the auth module early: a static import walk from
  `src/instrumentation.ts`'s self-request target (`src/app/api/cache-warm/route.ts`, 314 files)
  and from `src/proxy.ts` never reaches `src/lib/auth.ts`. So the first request that loads it
  comes from a user.
- `npx --yes @action-validator/cli` (0.6.0) exits 0 on the edited workflow. Mutation checks on a
  scratch copy all exit 1: `cancel-in-progress: sometimes` and a misspelt `cancel_in_progress`
  (`one_of` at `/concurrency`), and a broken indent (parse error). `js-yaml` parses the file to
  `concurrency: { group: "${{ github.workflow }}-${{ github.ref }}", cancel-in-progress: false }`.
- `vitest run`: 918/918 in 60 files. `npx tsc --noEmit`: exit 0. `npm run lint`: 0 problems.
  The CI `security-lint` grep, run locally: no matches. No code changed, so these only confirm
  nothing broke. Re-run after the review fixes, with the same results.

### Follow-ups

- `.claude/rules/security.md` "CI Enforcement" says the grep runs "on every push and PR to
  `main`". The workflow triggers on `push` only, for every branch. This was corrected in
  event-manager on this branch, but not here.

### `.env*` is now git-ignored (upstream MPNext 9e8ef87)

`.gitignore` listed only `.env.local`-style names, so a plain `.env` (which the MP model-generator scripts read), `.env.production` or a nested `.env` could be committed by accident. It now ignores `.env*` and re-includes only `.env.example`. Checked with `git check-ignore` on `.env`, `.env.production` and a nested `prisma/.env.test`; `.env.example` is still tracked. No tracked file changes status. Upstream's pre-commit hook was not adopted.
