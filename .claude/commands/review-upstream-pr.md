# Review Upstream PR Command

Analyze a merged upstream PR from `MinistryPlatform-Community/MPNext`, compare each commit against our fork, and selectively incorporate changes.

## Arguments

- `$ARGUMENTS` - Optional. One of:
  - `#123` or `123` - Upstream PR number
  - `https://github.com/MinistryPlatform-Community/MPNext/pull/123` - Full PR URL
  - *(no arguments)* - List all unreviewed upstream PRs and prompt user to select one

### Examples

```
/review-upstream-pr
/review-upstream-pr 53
/review-upstream-pr #53
/review-upstream-pr https://github.com/MinistryPlatform-Community/MPNext/pull/53
```

## Instructions

### 0. No Arguments — Discover Unreviewed PRs

If `$ARGUMENTS` is empty, find all upstream merged PRs we haven't reviewed yet:

1. Read `.claude/notes/upstream-sync-log.md` to determine the **highest PR number** already reviewed
2. Fetch all merged PRs from upstream after that number:
   ```bash
   gh pr list --repo MinistryPlatform-Community/MPNext --state merged --json number,title,mergedAt --limit 50
   ```
3. Filter out any PRs whose number is already in the sync log table
4. If **no unreviewed PRs remain**, tell the user:
   > All upstream merged PRs through #N have already been reviewed. Nothing new to process.

   Then stop.
5. If there are unreviewed PRs, present them as a numbered list:
   ```
   Unreviewed upstream PRs:
   1. #54 — Add new dashboard widget (merged 2026-03-10)
   2. #55 — Fix auth token refresh (merged 2026-03-12)
   3. #56 — Update dependencies (merged 2026-03-15)

   Which PR would you like to review? (enter a number, or "all" to review sequentially)
   ```
6. Wait for the user to select a PR, then continue to Step 1 with that PR number.

### 1. Fetch PR Details

```bash
# Get PR metadata
gh pr view <id> --repo MinistryPlatform-Community/MPNext --json title,body,mergedAt,mergeCommit,state,commits,files

# Verify it's actually merged
# If not merged, STOP and tell the user
```

Confirm the PR is merged. Display a summary:
- PR title and number
- Merge date
- Number of commits
- Files changed (list them)

### 2. Fetch Upstream and Identify Commits

```bash
git fetch upstream
```

List all commits in the PR. For each commit, get the full diff:

```bash
gh pr view <id> --repo MinistryPlatform-Community/MPNext --json commits
# Then for each commit SHA:
git show <sha> --stat
git show <sha> -- <file>
```

### 3. Analyze Each Commit

**IMPORTANT — Files are NOT 1:1 with upstream.** This fork has renamed files, moved code between files, reorganized directories, and added entirely new modules. Do NOT limit analysis to matching filenames. Instead:

1. **Understand the intent** of each upstream change first — what problem does it solve, what behavior does it add or fix?
2. **Search our codebase** for where that same logic, feature, or pattern lives — even if the file has a different name, the code is in a different directory, or the functionality was refactored into a different module.
3. **Apply the upstream intent to our structure**, not the upstream file paths. For example, if upstream fixes a bug in `middleware.ts`, the equivalent fix in our fork may belong in `proxy.ts`. If upstream adds a utility to `lib/utils.ts`, we may have split that into a dedicated file.

Use Grep and Glob liberally to locate where the relevant code lives in our fork before deciding whether a change applies.

For **every** commit in the PR, perform this analysis:

#### a) Check if already incorporated
- Does our codebase already have this change (same logic, different commit)?
- Was the file modified in a way that supersedes the upstream change?
- Has the code been moved to a different file in our fork? Search by function/variable names, not just file paths.

#### b) Check for conflicts with our fork
- Do we have divergent changes in the same files — or in files that now contain the equivalent code?
- Does the change touch code we've intentionally modified (auth, security, services)?
- Would applying this break our architecture (Next.js 16, Better Auth, Zod v4, etc.)?

#### c) Assess relevance
- Does this change affect features/code we use, even if our version lives in a different file?
- Is it a dependency update we should match?
- Is it a bug fix that applies to our fork?
- Is it test/CI/docs that's upstream-specific?

#### d) Security review
- Does the change introduce any security concerns?
- Does it weaken sanitization or validation we've added?
- Reference `.claude/notes/security-review-checklist.md` for PII/filter safety

### 4. Present Analysis

For each commit, present a recommendation in this format:

```
### Commit: <short-sha> — <commit message>
**Files**: <list of files changed>
**Recommendation**: Incorporate / Skip / Already incorporated / Partial (specify which files)
**Rationale**: <why>
**Conflicts**: <any conflicts with our fork, or "None">
**Action needed**: <specific steps if incorporating, or "None">
```

After all commits are analyzed, present a summary table:

| Commit | Message | Recommendation | Rationale |
|--------|---------|---------------|-----------|
| abc123 | Fix foo | Incorporate | Bug fix applies to our code |
| def456 | Add CI | Skip | Upstream-specific infrastructure |

### 5. Get User Approval

Ask the user to confirm the plan before making any changes. The user may:
- Approve all recommendations as-is
- Override individual recommendations
- Ask for more detail on specific commits
- Abort entirely

**Do NOT cherry-pick or modify any files until the user explicitly approves.**

### 6. Apply Approved Changes

For each commit marked "Incorporate":

#### Option A: Clean cherry-pick (no conflicts expected)
```bash
git cherry-pick <sha> --no-commit
# Review the staged changes
git diff --cached
# If clean, commit with attribution
```

#### Option B: Manual application (conflicts or partial incorporation)
- Apply changes manually using Edit tool
- Stage only the relevant files

#### Option C: Partial incorporation
- Cherry-pick specific files from the commit, not the whole thing

For **all** incorporated changes, commit with a message referencing the upstream PR:

```
cherry-pick upstream PR #<id>: <pr-title>

Incorporated commits: <list of SHAs>
Skipped commits: <list of SHAs with brief reason>

Upstream PR: https://github.com/MinistryPlatform-Community/MPNext/pull/<id>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

### 7. Update Documentation

#### a) Upstream Sync Log
Append a new row to the review table in `.claude/notes/upstream-sync-log.md`:

```markdown
| #<id> | <PR title> | <Action> | <Notes summarizing what was incorporated/skipped and why> |
```

Update the "Last Review" date at the top of the section.

#### b) Status File
Update `.claude/status.md` to reflect the new upstream sync checkpoint (e.g., "Upstream sync current through PR #N").

#### c) Session Summary
If a session summary exists for today, update it with the upstream review details.

### 8. Final Report

Present a final summary:
- Which commits were incorporated and what they changed in our codebase
- Which commits were skipped and why
- Any follow-up items (e.g., "upstream added a new dependency we should evaluate separately")
- Files created, modified, or removed

## Important Rules

- **Never merge upstream directly** — always cherry-pick selectively
- **Never weaken our security** — if upstream lacks sanitization we've added, keep ours
- **Preserve our architecture** — we may use different patterns (Better Auth vs NextAuth, different service layer, etc.)
- **Ask before acting** — present analysis and wait for user approval before any file changes
- **Match the sync log format** — follow the exact table format in `upstream-sync-log.md`
- **One PR at a time** — this command reviews a single upstream PR per invocation
