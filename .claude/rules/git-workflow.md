# Git & Pull Request Workflow

**IMPORTANT: This is a FORK repository**

- **Origin**: `The-Moody-Church/mp-charts` (THIS fork - where we work)
- **Upstream**: `MinistryPlatform-Community/MPNext` (upstream project)

## Creating Pull Requests

> **MANDATORY: `--repo The-Moody-Church/mp-charts` is REQUIRED on EVERY `gh pr create` call.**
>
> Without this flag, `gh` defaults to the upstream repo (`MinistryPlatform-Community/MPNext`), which creates PRs on the wrong repository. This has caused problems multiple times. There are NO exceptions to this rule.

```bash
# CORRECT — always include --repo flag
gh pr create --repo The-Moody-Church/mp-charts --title "..." --body "..."

# NEVER DO THIS — creates PR on upstream, not the fork
gh pr create --title "..." --body "..."
```

**Before running `gh pr create`**, verify:
1. The command includes `--repo The-Moody-Church/mp-charts`
2. The base branch is correct (usually `main`)
3. You are NOT creating a PR on `MinistryPlatform-Community/MPNext`

## Pre-PR Security Review

**MANDATORY**: Before creating any PR, review all changed files against the security checklist in `.claude/notes/security-review-checklist.md`. Include a "Security Review" section in the PR description summarizing what was checked and any findings.

## Pre-PR Documentation Update

**MANDATORY**: Before creating or merging a PR, update all context files so they are included in the merged branch — not committed to `main` after the fact.

**Steps:**
1. Review the commits in the branch (`git log main..HEAD --oneline`) and identify which issues are addressed
2. Check open issues: `gh issue list --repo The-Moody-Church/mp-charts --state open`
3. For each issue that the branch **fully resolves**:
   - Mark the corresponding entry in `docs/ideas.md` as completed: `### ~~Title ([#N](url))~~ COMPLETED`
   - Move it below all incomplete entries in its section
   - Add or update the description to summarize what was done
4. For issues that are **partially addressed** or need more detail, update the ideas.md entry body text to reflect current status
5. Update `docs/status.md` — move work from "In Progress" to "Recently Completed" (or add a new entry)
6. Update `docs/sessions/session-summary-YYYY-MM-DD.md` with final session status
7. Commit all updated context files (`ideas.md`, `status.md`, session summary) **on the feature branch** before merging

This ensures context files are part of the PR's commit history and ideas.md stays accurate for the GitHub Actions sync.

## Upstream Sync

This fork tracks `MinistryPlatform-Community/MPNext`. Upstream changes are reviewed periodically and cherry-picked selectively — we do **not** merge upstream directly. **GitHub will show "N commits behind"** — this is expected and harmless.

Sync instructions and review history: `.claude/notes/upstream-sync-log.md`

## Auto-Commit `.claude/settings.local.json`

When committing changes, if `.claude/settings.local.json` has pending modifications, include it in the commit. This file tracks Claude Code permission settings and should stay in sync.

## Branch Before Committing Code Changes

**Never commit code changes directly to `main`.** If the changes include any source code (`.ts`, `.tsx`, `.js`, `.css`, config files, etc.), stop and ask the user whether to create a feature branch before committing.

- **Documentation-only changes** (`.md` files, `.claude/` context files, `docs/` context files, `ideas.md`) **may** be committed directly to `main`.
- **Code changes** — even small ones — must go on a branch and be merged via PR. This ensures the pre-PR checklist (security review, ideas.md sync) is always triggered.

If you're unsure whether a change counts as "code" or "documentation", ask.

## Always Push After Committing

This is a single-developer fork. Every commit to `main` (or any branch) must be followed immediately by a `git push`. There is no reason to leave commits unpushed — unpushed commits miss CI (Docker build, image scan) and risk diverging from the remote.

**Rule**: After every successful `git commit`, run `git push` in the same operation. If on a new branch, use `git push -u origin <branch>`.

## PR Merge Strategy

Always use **merge commits** (`gh pr merge --merge`), not squash merges. This preserves the full commit history on `main`, making it easier to trace individual changes back to their original context.

```bash
# CORRECT — merge commit
gh pr merge N --repo The-Moody-Church/mp-charts --merge --delete-branch

# NEVER — squash loses individual commit history
gh pr merge N --repo The-Moody-Church/mp-charts --squash --delete-branch
```

## Handling `package-lock.json` and `next-env.d.ts`

Both files are committed to the repo and must NOT be added to `.gitignore`.

- **`package-lock.json`**: Commit when dependencies are intentionally added, removed, or updated. Discard changes caused by running `npm install` without modifying `package.json` (e.g., switching branches, peer dependency metadata churn).
- **`next-env.d.ts`**: Commit when upgrading Next.js versions (the file content may legitimately change). Discard changes caused by running `next dev` or `next build` locally that only shuffle import paths or reference styles.

**Rule of thumb**: If the change is a side effect of running a local command (not an intentional dependency or framework change), discard it with `git checkout -- <file>`.

## Keeping `.env.example` in Sync

When adding, removing, or renaming environment variables, update `.env.example` to match. This file documents all required and optional env vars for new developers and deployments. Add a brief comment above each variable explaining its purpose and how to generate it (if applicable). Never put actual secret values in `.env.example`.
