# CLAUDE.md - MPNext Development Guide

This guide provides essential information for AI assistants (like Claude) working on the MPNext project.

## Git & Pull Request Workflow

**IMPORTANT: This is a FORK repository**

- **Origin**: `The-Moody-Church/mp-charts` (THIS fork - where we work)
- **Upstream**: `MinistryPlatform-Community/MPNext` (upstream project)

### Creating Pull Requests

> **🚨 MANDATORY: `--repo The-Moody-Church/mp-charts` is REQUIRED on EVERY `gh pr create` call.**
>
> Without this flag, `gh` defaults to the upstream repo (`MinistryPlatform-Community/MPNext`), which creates PRs on the wrong repository. This has caused problems multiple times. There are NO exceptions to this rule.

```bash
# ✅ CORRECT — always include --repo flag
gh pr create --repo The-Moody-Church/mp-charts --title "..." --body "..."

# ❌ NEVER DO THIS — creates PR on upstream, not the fork
gh pr create --title "..." --body "..."
```

**Before running `gh pr create`**, verify:
1. The command includes `--repo The-Moody-Church/mp-charts`
2. The base branch is correct (usually `main`)
3. You are NOT creating a PR on `MinistryPlatform-Community/MPNext`

### Pre-PR Security Review

**MANDATORY**: Before creating any PR, review all changed files against the security checklist in `.claude/notes/security-review-checklist.md`. Include a "Security Review" section in the PR description summarizing what was checked and any findings.

### Pre-PR Documentation Update

**MANDATORY**: Before creating or merging a PR, update all context files so they are included in the merged branch — not committed to `main` after the fact.

**Steps:**
1. Review the commits in the branch (`git log main..HEAD --oneline`) and identify which issues are addressed
2. Check open issues: `gh issue list --repo The-Moody-Church/mp-charts --state open`
3. For each issue that the branch **fully resolves**:
   - Mark the corresponding entry in `.claude/ideas.md` as completed: `### ~~Title ([#N](url))~~ ✅ COMPLETED`
   - Move it below all incomplete entries in its section
   - Add or update the description to summarize what was done
4. For issues that are **partially addressed** or need more detail, update the ideas.md entry body text to reflect current status
5. Update `.claude/status.md` — move work from "In Progress" to "Recently Completed" (or add a new entry)
6. Update `.claude/sessions/session-summary-YYYY-MM-DD.md` with final session status
7. Commit all updated context files (`ideas.md`, `status.md`, session summary) **on the feature branch** before merging

This ensures context files are part of the PR's commit history and ideas.md stays accurate for the GitHub Actions sync.

### Upstream Sync

This fork tracks `MinistryPlatform-Community/MPNext`. Upstream changes are reviewed periodically and cherry-picked selectively — we do **not** merge upstream directly. **GitHub will show "N commits behind"** — this is expected and harmless.

Sync instructions and review history: `.claude/notes/upstream-sync-log.md`

### Auto-Commit `.claude/settings.local.json`

When committing changes, if `.claude/settings.local.json` has pending modifications, include it in the commit. This file tracks Claude Code permission settings and should stay in sync.

### Branch Before Committing Code Changes

**Never commit code changes directly to `main`.** If the changes include any source code (`.ts`, `.tsx`, `.js`, `.css`, config files, etc.), stop and ask the user whether to create a feature branch before committing.

- **Documentation-only changes** (`.md` files, `.claude/` context files, `ideas.md`) **may** be committed directly to `main`.
- **Code changes** — even small ones — must go on a branch and be merged via PR. This ensures the pre-PR checklist (security review, ideas.md sync) is always triggered.

If you're unsure whether a change counts as "code" or "documentation", ask.

### Always Push After Committing

This is a single-developer fork. Every commit to `main` (or any branch) must be followed immediately by a `git push`. There is no reason to leave commits unpushed — unpushed commits miss CI (Docker build, image scan) and risk diverging from the remote.

**Rule**: After every successful `git commit`, run `git push` in the same operation. If on a new branch, use `git push -u origin <branch>`.

### PR Merge Strategy

Always use **merge commits** (`gh pr merge --merge`), not squash merges. This preserves the full commit history on `main`, making it easier to trace individual changes back to their original context.

```bash
# ✅ CORRECT — merge commit
gh pr merge N --repo The-Moody-Church/mp-charts --merge --delete-branch

# ❌ NEVER — squash loses individual commit history
gh pr merge N --repo The-Moody-Church/mp-charts --squash --delete-branch
```

### Handling `package-lock.json` and `next-env.d.ts`

Both files are committed to the repo and must NOT be added to `.gitignore`.

- **`package-lock.json`**: Commit when dependencies are intentionally added, removed, or updated. Discard changes caused by running `npm install` without modifying `package.json` (e.g., switching branches, peer dependency metadata churn).
- **`next-env.d.ts`**: Commit when upgrading Next.js versions (the file content may legitimately change). Discard changes caused by running `next dev` or `next build` locally that only shuffle import paths or reference styles.

**Rule of thumb**: If the change is a side effect of running a local command (not an intentional dependency or framework change), discard it with `git checkout -- <file>`.

### Keeping `.env.example` in Sync

When adding, removing, or renaming environment variables, update `.env.example` to match. This file documents all required and optional env vars for new developers and deployments. Add a brief comment above each variable explaining its purpose and how to generate it (if applicable). Never put actual secret values in `.env.example`.

## Commands

- **Dev**: `npm run dev` (Next.js dev server)
- **Build**: `npm run build` (production build with Turbopack, runs type checking)
- **Lint**: `npm run lint` (ESLint — `next lint` was removed in Next.js 16, uses `eslint` directly)
- **Generate MP Types**: `npm run mp:generate:models` (generates TypeScript types + Zod schemas from Ministry Platform API, cleans output directory first)
- **Tests**: `npm test` (Vitest in watch mode), `npm run test:run` (single run), `npm run test:coverage` (with coverage)
- **Setup**: `npm run setup` (interactive project setup), `npm run setup:check` (validation-only mode)

### Type Generation Notes

- Generated types automatically quote field names with special characters (e.g., `"Allow_Check-in"`)
- The `mp:generate:models` script uses `--clean` flag to remove old files before regenerating
- Manual generation with options: `tsx src/lib/providers/ministry-platform/scripts/generate-types.ts --help`

## Architecture

- **Framework**: Next.js 16 (App Router, Turbopack, Cache Components/PPR) with React 19, TypeScript strict mode
- **Ministry Platform Integration**: Custom provider at `src/lib/providers/ministry-platform/` with REST API client, auth, and type-safe models
- **Auth**: Better Auth (`better-auth@^1.4`) with Ministry Platform OAuth via `genericOAuth` plugin (`src/lib/auth.ts`)
  - **Server Config**: `src/lib/auth.ts` — `betterAuth()` with `genericOAuth`, `customSession`, `nextCookies()` plugins
  - **Client Config**: `src/lib/auth-client.ts` — `createAuthClient()` with matching client plugins
  - **Auth Helpers**: `src/lib/auth-helpers.ts` — `getSession()`, `requireSession()`, `getMpUserId()`, `getUserGuid()` for server actions
  - **Route Handler**: `src/app/api/auth/[...all]/route.ts` — Better Auth API route
  - **Route Protection**: `src/proxy.ts` — Next.js 16 proxy with session cookie validation via `getSessionCookie` from `better-auth/cookies`
  - **Session Strategy**: JWT cookie-based sessions; no per-user OIDC tokens stored — services use client credentials (`MPHelper` singleton) with `$userId` for audit attribution
  - **User Fields**: `additionalFields` on user model: `userGuid`, `mpUserId`, `mpContactId` — populated at login via `getUserInfo` callback
  - **OIDC Logout**: Implements RP-initiated logout flow to properly end Ministry Platform OAuth sessions
  - **Required Environment Variables**: `MINISTRY_PLATFORM_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`
  - **MP OAuth Setup**: Requires Post-Logout Redirect URIs configured in Ministry Platform OAuth client (see README.md)
- **Services Layer**: Singleton service classes in `src/services/` wrap MPHelper for domain logic (ContactService, ContactLogService, ComplianceProcessingService, DashboardService, FeedbackService, JourneyProcessingService, UserService)
- **Contexts**: React context providers in `src/contexts/` (UserProvider, RuntimeConfigProvider) composed in `src/app/providers.tsx`; session access via `authClient.useSession()` from `src/lib/auth-client.ts`
- **Validation**: Zod v4 (`zod@^4.3`) — note: different API from Zod v3 (e.g., `z.guid()` instead of `z.string().uuid()`, type imports via `z.ZodObject<z.ZodRawShape>`)
- **UI**: Radix UI primitives + shadcn/ui components in `src/components/ui/`, Tailwind CSS v4
- **Path Alias**: `@/*` maps to `src/*`

## Next.js 16 Notes

- **Proxy (formerly Middleware)**: Route protection lives in `src/proxy.ts` with an exported `proxy()` function (not `middleware.ts`/`middleware()`)
- **Turbopack**: Default bundler for both `dev` and `build` — no `--turbopack` flag needed
- **ESLint**: Uses `eslint .` directly (not `next lint`); config is native flat config in `eslint.config.mjs`
- **Async Dynamic APIs**: `params`, `searchParams`, `cookies()`, `headers()` must always be awaited — synchronous access is removed
- **Dev output**: `next dev` outputs to `.next/dev` (not `.next`)
- **Cache Components (PPR)**: `cacheComponents: true` in `next.config.ts` enables Partial Prerendering — static shells pre-render at build time, dynamic content streams at request time

## Caching & PPR

Uses **Cache Components** (`cacheComponents: true`) with **Partial Prerendering (PPR)** and stale-while-revalidate. Caches are pre-warmed on server start and daily at 6:00 AM CT.

**Critical rules:**
- `new Date()` must stay OUTSIDE `'use cache'` functions — pass as serializable parameters
- **Never silently return empty data** in cached code paths — let errors propagate so stale data is served
- Cache keys must be stable (not date-based) to avoid cold cache misses
- New cached functions MUST be registered in `src/lib/cache-warming.ts`

Full details, cached function registry, Suspense/PPR patterns, and cache warming architecture: `.claude/references/caching-ppr.md`

## Code Style

- **Imports**: Use `@/` alias for all internal imports
- **Components**: React Server Components by default, "use client" only when needed for interactivity
- **Types**: TypeScript interfaces exported from models, Zod schemas for validation
- **Naming**:
  - PascalCase for components/types
  - camelCase for functions/variables
  - kebab-case for all component files and folders
  - snake_case for Ministry Platform API fields
- **Exports**: Use named exports for all components (no default exports)
- **UI Components**: Keep in `src/components/ui/` following shadcn conventions
- **Feature Components**: Organize in kebab-case folders with index.ts barrel exports
- **Actions**:
  - Feature-specific actions: co-locate in component folder as `actions.ts`
  - Shared actions: place in `src/components/shared-actions/`
- **Ministry Platform Structure**:
  - Database models (generated): `src/lib/providers/ministry-platform/models/` - auto-generated from DBMS
  - Zod schemas (generated): `src/lib/providers/ministry-platform/models/*Schema.ts` - for optional runtime validation
  - DTOs/ViewModels (hand-written): `src/lib/dto/` - application-level data transfer objects
  - Services (hand-written): `src/services/` - singleton classes wrapping MPHelper for domain operations
- **Validation**: 
  - Use optional `schema` parameter in `createTableRecords()` and `updateTableRecords()` for runtime validation before API calls
  - For updates, set `partial: false` to require all fields (default is `partial: true` for partial updates)
  - Validation errors provide detailed feedback with record index and field-level issues

## Component Organization

```
src/components/
├── shared-actions/       # Shared actions used across features
├── ui/                   # shadcn/ui components
├── processing/           # Shared processing UI components (barrel export)
├── layout/               # Layout components with barrel export (index.ts)
│   ├── auth-wrapper.tsx  # Authentication wrapper (Server Component)
│   ├── header.tsx        # App header with navigation
│   ├── sidebar.tsx       # Navigation sidebar
│   └── dynamic-breadcrumb.tsx
├── feature-name/         # Feature components (kebab-case)
│   ├── feature-name.tsx
│   ├── actions.ts        # Feature-specific server actions
│   └── index.ts          # Barrel exports
```

## Data Flow

Server actions in `actions.ts` should call **service classes** (not MPHelper directly):

```
Component → Server Action → Service (singleton) → MPHelper → Ministry Platform API
```

### Ministry Platform API Concurrency

The MP API (`moody.ministryplatform.com`) has limited connection capacity. **Never fire unbounded parallel requests** — use the `mapWithConcurrency` utility in `dashboardService.ts` to limit concurrent API calls (currently capped at 6). This is especially important for methods that iterate over many months or records.

Without concurrency control, bursts of 50+ simultaneous connections cause `ConnectTimeoutError` (TCP timeout), which can cascade into token refresh failures and silent data loss. This was the root cause of intermittent 0-attendance on the dashboard (fixed 2026-03-15).

## Admin Tool Editors (Journey & Compliance)

The **Journey Tools** admin (`src/components/admin/journey-tools/`) and **Compliance Tools** admin (`src/components/admin/compliance-tools/`) share the same UX patterns and must stay in sync:

| Pattern | Implementation |
|---------|---------------|
| **Field-level error highlighting** | `errorFields: Set<string>` + `fieldErrorClass()` / `clearFieldError()` |
| **Error placement** | Error message displayed near save button, not at top of form |
| **Slug auto-sanitization** | `onChange` lowercases, replaces invalid chars with hyphens |
| **Duplicate slug protection** | Client-side check against `existingSlugs` + server-side `isNew` flag |
| **Zod error parsing** | Server catches `z.ZodError`, formats as `"field: message; ..."` |
| **Form sections** | `<fieldset>` with `<legend>` for visual grouping |
| **Used journey filtering** | `usedJourneyIds` prop filters journey dropdown to prevent duplicates |
| **Default group role** | Defaults to "Member" (ID: 2) for new tools |

**IMPORTANT**: When making changes to validation, error handling, form layout, or UX patterns in **either** editor, check whether the same change should be applied to the other. Always ask the user if unsure. The two editors are intentionally parallel — shared actions like `getAvailableJourneys`, `getAvailableGroups`, etc. live in the journey tools actions and are imported by the compliance editor.

Key files:
- `src/components/admin/journey-tools/journey-tool-editor.tsx` — Journey tool form
- `src/components/admin/journey-tools/actions.ts` — Journey admin server actions (shared MP queries)
- `src/components/admin/compliance-tools/compliance-tool-editor.tsx` — Compliance tool form
- `src/components/admin/compliance-tools/actions.ts` — Compliance admin server actions

## Feature Visibility & Access Control

Feature visibility in the home page and sidebar is controlled by RBAC (feature-to-User-Group mappings), not environment variables. Users only see features their User Groups grant access to. Admin users (in `ADMIN_USER_GROUP_IDS` groups) see all features plus the admin settings page.

**Current features:**
- Executive Dashboard (`/dashboard`) — feature: `dashboard`
- Contact Lookup (`/contact-lookup`) — feature: `contact-lookup`
- Journey tools (`/journey/*`) — dynamically added from tool configuration
- Compliance tools (`/compliance/*`) — dynamically added from tool configuration
- Admin/Setup (`/admin`) — admin-only

Feature visibility is configured in:
- `src/components/home/home-cards.tsx` — home page feature cards
- `src/components/layout/sidebar.tsx` — sidebar navigation items

## Import Patterns

- Use `@/` alias for all internal imports (e.g., `@/components/`, `@/services/`, `@/lib/`)
- Feature components use barrel exports: `import { ContactLookup } from '@/components/contact-lookup'`
- Auth server-side: `import { requireSession, getMpUserId } from '@/lib/auth-helpers'`
- Auth client-side: `import { authClient } from '@/lib/auth-client'`
- Services in actions: `import { ContactService } from '@/services/contactService'`
- Feature-specific actions use relative path: `import { searchContacts } from './actions'`
- **Named exports only** — no default exports

## Chart Formatting Standards

All time-series charts must use consistent short date labels on the X-axis:

| View | Format | Example | `toLocaleDateString` options |
|------|--------|---------|------------------------------|
| **Monthly** | `Mon YY` | "Feb 26", "Sep 25" | `{ month: 'short', year: '2-digit' }` |
| **Weekly** | `Mon D` | "Feb 1", "Feb 8" | `{ month: 'short', day: 'numeric' }` |

**Do NOT** use full month names ("February", "September") as X-axis labels — they take too much space and are inconsistent across charts.

Charts that follow this standard:
- `AttendanceChart` — monthly and weekly views
- `CommunityAttendanceChart` — monthly and weekly views
- `SmallGroupTrends` (Communities and Groups Trends) — monthly only

When adding new time-series charts, use the same `toLocaleDateString('en-US', ...)` pattern with the options above.

### Year-over-Year Weekly Comparison (Single-Month View)

When a chart shows weekly data for a single month with previous-year comparison enabled, **interleave** dates from both years on the same x-axis sorted by month-day (MM-DD). Use solid lines for the current year and dashed lines (`strokeDasharray="5 5"`) for the previous year, with `connectNulls` so each line draws through gaps where only the other year has data.

**Merging same-day entries**: When both years have data on the same day-of-month (e.g., Dec 24), merge them into a **single x-axis point** with both `currentTotal` and `previousTotal` populated. Never create duplicate x-axis entries for the same MM-DD.

```typescript
// ✅ CORRECT — use a Map keyed by MM-DD to merge same-day entries
const mergedMap = new Map<string, { name: string; daySortKey: string; currentTotal?: number; previousTotal?: number }>();
for (const w of currentWeekly) {
  const key = w.date.slice(5); // MM-DD
  mergedMap.set(key, { name: w.dateLabel, daySortKey: key, currentTotal: w.total });
}
for (const w of previousWeekly) {
  const key = w.date.slice(5); // MM-DD
  const existing = mergedMap.get(key);
  if (existing) {
    existing.previousTotal = w.total; // merge into same entry
  } else {
    mergedMap.set(key, { name: w.dateLabel, daySortKey: key, previousTotal: w.total });
  }
}
const chartData = Array.from(mergedMap.values()).sort((a, b) => a.daySortKey.localeCompare(b.daySortKey));

// ❌ NEVER push current and previous into separate array entries without checking for duplicates
```

Charts that follow this pattern:
- `AttendanceChart` — weekly single-month view
- `CommunityTotalAttendanceChart` — weekly single-month view

## Mobile & Responsive Guidelines

All features must work on mobile (375px+). Use **mobile-first** Tailwind classes. Use `useIsMobile()` from `@/hooks/use-mobile` when component **behavior** must change by screen size; use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) for layout-only changes.

Full patterns, anti-patterns, and standards: `.claude/references/mobile-responsive.md`

## UI Style Guide

### Contact Action Links (Email, Phone, External URLs)

When displaying actionable contact information (email, phone, links to external systems), render them as **bordered pill-style buttons** with an inline SVG icon — not as plain text links. This pattern provides a clear click target and consistent visual treatment across features.

```tsx
<a
  href={`mailto:${email}`}
  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors"
>
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    {/* icon path */}
  </svg>
  {email}
</a>
```

**Key classes**: `inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors`

Components using this pattern:
- `BaptismDetailModal` — email and phone links
- `MembershipDetailModal` — email and phone links

## Key Development Practices

1. **Always use the `@/` path alias** for imports instead of relative paths
2. **Prefer Server Components** - only use "use client" when absolutely necessary
3. **Follow naming conventions strictly** - kebab-case for files/folders, PascalCase for components
4. **Use named exports** - no default exports
5. **Co-locate feature code** - keep actions.ts with their related components
6. **Never manually edit generated files** - regenerate types using `npm run mp:generate:models`
7. **Use TypeScript strict mode** - all code must be type-safe
8. **Validate at API boundaries** - use Zod schemas with the `schema` parameter in `createTableRecords()` and `updateTableRecords()` for runtime validation
9. **Use service classes in server actions** - call services from `src/services/`, not MPHelper directly from components or actions
10. **Report file changes** - after completing work, always report in chat which files were **created**, **modified**, or **removed**

## Timezone Handling — Ministry Platform Dates

MP returns dates without timezone info in **US Central Time**. `new Date("2026-03-12")` parses as UTC, showing the wrong day in Central.

**Rule**: Parse MP dates as local time using `parseLocalDate()` (in `src/components/contact-lookup-details/contact-lookup-details.tsx`) — extracts year/month/day components to avoid UTC shift. When sending dates to MP, use SQL format (`YYYY-MM-DD HH:MM:SS`) — convert **after** Zod validation, not before.

## Validation Best Practices

When working with Ministry Platform data:

```typescript
import { MPHelper } from '@/lib/providers/ministry-platform';
import { ContactLogSchema } from '@/lib/providers/ministry-platform/models';

const mp = new MPHelper();

// ✅ Good: Validate data before creating records
await mp.createTableRecords('Contact_Log', records, {
  schema: ContactLogSchema,
  $userId: currentUser.Contact_ID
});

// ✅ Good: Partial validation for updates (default)
await mp.updateTableRecords('Contact_Log', partialRecords, {
  schema: ContactLogSchema,
  partial: true, // default, allows partial updates
  $userId: currentUser.Contact_ID
});

// ✅ Good: Strict validation for full record updates
await mp.updateTableRecords('Contact_Log', fullRecords, {
  schema: ContactLogSchema,
  partial: false, // require all fields
  $userId: currentUser.Contact_ID
});

// ⚠️ Acceptable: Skip validation (backward compatible)
await mp.createTableRecords('Contact_Log', records, {
  $userId: currentUser.Contact_ID
});
```

## Security Best Practices

This project handles **PII**. Every string in a `filter:` parameter MUST use `sanitizeFilterValue()`, `sanitizeIds()`, or `sanitizeGuid()` from `@/lib/providers/ministry-platform/utils/filter-sanitize`. Every server action MUST call `requireSession()` before data access. Never log PII in production.

Full rules, code examples, rate limiting tiers, and security headers: `.claude/references/security-best-practices.md`
Audit report: `.claude/notes/security-audit-2026-02-24.md`

## Memory & Context Management

AI assistants maintain context files in `.claude/` to track project state across sessions.

### Folder Structure

```
.claude/
├── status.md             # Quick-reference project status (read first at session start)
├── sessions/             # Dated session summaries (one per session)
│   └── session-summary-YYYY-MM-DD.md
├── plans/                # Implementation plans and draft issue specs
├── notes/                # Debugging notes, audit reports, reference docs
├── references/           # Auto-generated schema, component inventory
│   ├── components.md
│   └── ministryplatform.schema.md
├── commands/             # Claude Code slash commands
├── ideas.md              # Feature ideas & improvements (syncs with GitHub Issues)
└── settings.local.json   # Claude Code permission settings
```

### Status File

`.claude/status.md` is a **lightweight snapshot** of current project state — recently completed work, in-progress items, and open issues. Read it first at session start to orient quickly without scanning all session summaries. Keep it short (under 50 lines). Update it when completing significant work or when the project state changes meaningfully.

### Session Summaries

Each session gets a dated file at `.claude/sessions/session-summary-YYYY-MM-DD.md`. This is the primary record of what happened during a session.

**Session start — create immediately:**
1. Create (or open) today's session summary file before any code work begins
2. Write a brief plan at the top: what the user is asking for, what you expect to do

**During the session — update continuously:**
- **After each user message**: If the user gives a command, asks a question, or provides feedback that changes direction, append a note capturing it
- **Before each non-documentation commit**: Update the summary with what's being committed (files changed, decisions made). Include it in the commit.
- **On key decisions**: Record the decision and rationale as it happens, not later

**At session end:**
- Review and clean up for clarity. Remove noise, consolidate duplicate entries, ensure file lists are complete and accurate
- Respond to user cues: "thanks", "that's all", "we're done", "end of session"
- User can request: "Create a session summary" or "Update context files"

**What to include:**
- Session plan / objectives (at the top)
- Issues addressed (with `#N` references)
- Files created / modified / removed (with line numbers for significant changes)
- Key decisions and their rationale
- User feedback and direction changes
- Known issues or follow-ups
- Status markers: ✅ COMPLETED, ⚠️ IN PROGRESS, ❌ BLOCKED

### Pre-Commit Checklist

Before every commit (on ANY branch):

1. **CLAUDE.md check**: Do the changes introduce new patterns, conventions, or architectural decisions? If so, update CLAUDE.md in the same commit.
2. **README.md check**: Do the changes affect anything documented in README.md? This includes: new/removed features, changed auth or env vars, new routes or components, updated services, changed project structure, or modified setup steps. If so, update README.md in the same commit.
3. **Session summary**: Update `.claude/sessions/session-summary-YYYY-MM-DD.md` with what's being committed.
4. **ideas.md**: If any issues were completed, update `.claude/ideas.md` (see "Ideas & Issue Tracking" section).
5. **status.md**: Update `.claude/status.md` to reflect completed work **before merging the PR** (not after on `main`). This ensures context files are part of the merged branch's history.
6. Include all updated context files in the commit.

## Ideas & Issue Tracking

Feature ideas, improvements, and tech debt are tracked in `.claude/ideas.md`. This file syncs **bidirectionally** with GitHub Issues via a GitHub Actions workflow (`.github/workflows/sync-issues-to-ideas.yml`).

### How It Works

| Direction | Trigger | What happens |
|---|---|---|
| **ideas.md → Issues** | Push to `main` (ideas.md changed) | New entries get issues created; completed entries close issues; edits update issues |
| **Issues → ideas.md** | Issue opened/closed/edited/labeled | ideas.md updated to reflect the change |

### ideas.md Format

Entries are organized under `## Features`, `## Improvements`, and `## Technical Debt` sections:

```markdown
### New Idea Title
Description of the idea.

### Linked Idea ([#12](url))
This entry is linked to issue #12. Edits sync both ways.

### ~~Done Item ([#5](url))~~ ✅ COMPLETED
This will close issue #5 on next push to main.
```

### During Sessions

- **Add new ideas**: Write a `### Title` entry under the appropriate section — no issue link needed, one will be created automatically on push
- **Update progress**: Edit the body text of any entry freely
- **Mark completed**: Wrap the title in `~~strikethrough~~` and add `✅ COMPLETED`
- **ideas.md is included in commits** alongside session summaries and other context files

### Entry Ordering

Within each section (`## Features`, `## Improvements`, `## Technical Debt`) **and** the Table of Contents, entries must be ordered:

1. **Incomplete items first** (active/open) — newest on top
2. **Completed items last** (~~strikethrough~~ ✅) — at the bottom of the section

When adding a new entry, insert it as the **first `###` heading** after the `## Section` header (above existing entries). When marking an entry completed, move it below all incomplete entries in the same section. The Table of Contents mirrors this order automatically.

This ordering is enforced in three places:
- **AI assistants**: Follow this convention when editing ideas.md during sessions
- **GitHub Actions**: The `sync-issues-to-ideas` workflow sorts entries after every sync
- **Manual edits**: If editing ideas.md by hand, maintain this order

### Labels

Issues are categorized by label, which maps to ideas.md sections:

| Label | Section |
|---|---|
| `feature` | Features |
| `improvement` | Improvements |
| `tech-debt` | Technical Debt |

### Loop Prevention

The workflow uses `[skip ci]` in bot commits and checks `github.actor` to prevent infinite loops between the two sync directions.

## Reference Documents

For detailed context on specific areas, see:

- **[Project Status](.claude/status.md)** - Quick-reference snapshot of current state (read first at session start)
- **[Components Reference](.claude/references/components.md)** - Detailed inventory of all components, their purposes, server actions, and compliance status
- **[Ministry Platform Schema](.claude/references/ministryplatform.schema.md)** - Auto-generated summary of Ministry Platform database tables, primary keys, and foreign key relationships
- **[Security Audit](.claude/notes/security-audit-2026-02-24.md)** - Full security audit report with 15 findings
