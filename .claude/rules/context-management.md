# Memory, Context & Issue Tracking

## Context Directories

AI assistants maintain context files across two directories:
- **`docs/`** — Session output artifacts (summaries, ideas, status) that change frequently. Lives outside `.claude/` so Claude Code can read/write freely without permission prompts.
- **`.claude/`** — Claude Code configuration (settings, commands, plans, notes, references, rules).

### Folder Structure

```
docs/
├── status.md             # Quick-reference project status (read first at session start)
├── sessions/             # Dated session summaries (one per session)
│   └── session-summary-YYYY-MM-DD.md
└── ideas.md              # Feature ideas & improvements (syncs with GitHub Issues)

.claude/
├── rules/                # Extracted rules referenced from CLAUDE.md
├── plans/                # Implementation plans and draft issue specs
├── notes/                # Debugging notes, audit reports, reference docs
├── references/           # Auto-generated schema, component inventory
│   ├── components.md
│   └── ministryplatform.schema.md
├── commands/             # Claude Code slash commands
└── settings.local.json   # Claude Code permission settings
```

## Status File

`docs/status.md` is a **lightweight snapshot** of current project state — recently completed work, in-progress items, and open issues. Read it first at session start to orient quickly without scanning all session summaries. Keep it short (under 50 lines). Update it when completing significant work. **Retention: keep only the last 7 days** in the "Recently Completed" table — older entries are preserved in git history and session summaries. When adding a new entry, remove any entries older than 7 days.

## Session Summaries

Each session gets a dated file at `docs/sessions/session-summary-YYYY-MM-DD.md`. Create it at session start with a brief plan. Update continuously: after direction changes, before commits, on key decisions. Include: objectives, issues addressed (`#N`), files changed, decisions + rationale, follow-ups. Use status markers: COMPLETED, IN PROGRESS, BLOCKED.

## Pre-Commit Checklist

Before every commit (on ANY branch):

1. **CLAUDE.md check**: Do the changes introduce new patterns, conventions, or architectural decisions? If so, update CLAUDE.md (or the relevant `.claude/rules/` file) in the same commit.
2. **README.md check**: Do the changes affect anything documented in README.md? This includes: new/removed features, changed auth or env vars, new routes or components, updated services, changed project structure, or modified setup steps. If so, update README.md in the same commit.
3. **Security check**: Do the changes touch `filter:` parameters, file uploads, redirects, or server actions? Review against `.claude/rules/security.md`.
4. **Session summary**: Update `docs/sessions/session-summary-YYYY-MM-DD.md` with what's being committed.
5. **ideas.md**: If any issues were completed, update `docs/ideas.md` (see "Ideas & Issue Tracking" below).
6. **status.md**: Update `docs/status.md` to reflect completed work **before merging the PR** (not after on `main`). This ensures context files are part of the merged branch's history.
7. Include all updated context files in the commit.

## Ideas & Issue Tracking

Feature ideas, improvements, and tech debt are tracked in `docs/ideas.md`. This file syncs **bidirectionally** with GitHub Issues via a GitHub Actions workflow (`.github/workflows/sync-issues-to-ideas.yml`).

### How It Works

| Direction | Trigger | What happens |
|---|---|---|
| **ideas.md -> Issues** | Push to `main` (ideas.md changed) | New entries get issues created; completed entries close issues; edits update issues |
| **Issues -> ideas.md** | Issue opened/closed/edited/labeled | ideas.md updated to reflect the change |

### ideas.md Format

Entries are organized under `## Features`, `## Improvements`, and `## Technical Debt` sections:

```markdown
### New Idea Title
Description of the idea.

### Linked Idea ([#12](url))
This entry is linked to issue #12. Edits sync both ways.

### ~~Done Item ([#5](url))~~ COMPLETED
This will close issue #5 on next push to main.
```

### During Sessions

- **Add new ideas**: Write a `### Title` entry under the appropriate section — no issue link needed, one will be created automatically on push
- **Update progress**: Edit the body text of any entry freely
- **Mark completed**: Wrap the title in `~~strikethrough~~` and add `COMPLETED`
- **ideas.md is included in commits** alongside session summaries and other context files

### Entry Ordering

Within each section, order: **incomplete items first** (newest on top), **completed items last** (~~strikethrough~~ at bottom). New entries go as the first `###` after the `## Section` header. Labels map to sections: `feature` -> Features, `improvement` -> Improvements, `tech-debt` -> Technical Debt.
