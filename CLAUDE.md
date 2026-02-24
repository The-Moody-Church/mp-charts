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

### Upstream Sync

This fork tracks `MinistryPlatform-Community/MPNext`. Upstream changes are reviewed periodically and cherry-picked selectively — we do **not** merge upstream directly, since the fork has intentionally diverged (e.g., Next.js 16 — upstream recently upgraded to 16 as well).

To check for new upstream changes:

```bash
git fetch upstream
git log main..upstream/main --oneline
```

Or review PRs at: https://github.com/MinistryPlatform-Community/MPNext/pulls

#### Last Review: 2026-02-20

Reviewed all open/merged upstream PRs through PR #42. Status:

| PR | Title | Action | Notes |
|----|-------|--------|-------|
| #37 | Security patches (Next.js + React) | Incorporated | Already on Next.js 16; `react`/`react-dom` at `^19.2.4` exceeds the `≥19.1.0` pin |
| #38 | Dependency version updates | Incorporated | Bumped minimum pinned versions for all packages including lucide-react |
| #39 | sanitizeTypeName digit-leading fix | Already incorporated | Same fix as #40; our `sanitizeTypeName` already prefixes `_` for digit-leading names |
| #40 | Generator fix for digit-leading names | Incorporated | `sanitizeTypeName` prefixes `_` when result starts with a digit |
| #41 | Upgrade to Next.js 16 + all deps | Incorporated | Already on Next.js 16; cherry-picked: `middleware.ts` → `proxy.ts` rename, removed unused `@eslint/eslintrc`. Bumped all deps to match upstream pins: zod v4, openai v6, dotenv v17, @types/node ^25, jsdom ^28, all Radix UI, tailwindcss ^4.2, typescript ^5.9.3, and 10+ more |
| #42 | Docs + `@inquirer/prompts` v8 | Incorporated | Upgraded `@inquirer/prompts` ^7→^8; updated `components.md` layout import patterns. Cherry-picked CLAUDE.md additions: Next.js 16 Notes section, Services Layer + Contexts in Architecture, Data Flow section, service import patterns |

**GitHub will show "N commits behind"** — this is expected and harmless. It reflects diverged commit history, not missing changes.

### Auto-Commit `.claude/settings.local.json`

When committing changes, if `.claude/settings.local.json` has pending modifications, include it in the commit. This file tracks Claude Code permission settings and should stay in sync.

### Handling `package-lock.json` and `next-env.d.ts`

Both files are committed to the repo and must NOT be added to `.gitignore`.

- **`package-lock.json`**: Commit when dependencies are intentionally added, removed, or updated. Discard changes caused by running `npm install` without modifying `package.json` (e.g., switching branches, peer dependency metadata churn).
- **`next-env.d.ts`**: Commit when upgrading Next.js versions (the file content may legitimately change). Discard changes caused by running `next dev` or `next build` locally that only shuffle import paths or reference styles.

**Rule of thumb**: If the change is a side effect of running a local command (not an intentional dependency or framework change), discard it with `git checkout -- <file>`.

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
- **Services Layer**: Singleton service classes in `src/services/` wrap MPHelper for domain logic (ContactService, ContactLogService, DashboardService, ToolService, UserService, VolunteerService)
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

The project uses **Cache Components** (`cacheComponents: true`) with **Partial Prerendering (PPR)**. All authenticated pages render as `◐ (Partial Prerender)` — the static HTML shell loads instantly, then dynamic content streams in via Suspense boundaries.

### `'use cache'` Directive

Data-fetching functions use the `'use cache'` directive with `cacheLife()` and `cacheTag()` from `next/cache`:

```typescript
import { cacheLife, cacheTag } from 'next/cache';

async function getCachedData(key: string) {
  'use cache';
  cacheLife({ revalidate: 21600 }); // 6 hours
  cacheTag('my-tag');
  // ... fetch data ...
}
```

**Rules for `'use cache'` functions:**
- `new Date()` and other non-deterministic expressions must stay OUTSIDE the function — pass as serializable parameters
- Function arguments automatically become the cache key
- Invalidate with `revalidateTag('my-tag', { expire: 0 })` from server actions

**Current cached functions:**
| Function | TTL | Tags | File |
|---|---|---|---|
| `getCachedDashboardData(year)` | 6h | `dashboard-data`, `year-N` | `src/components/dashboard/actions.ts` |
| `getCachedFullRangeData(year, endDate)` | 6h | `dashboard-data`, `dashboard-full-range` | `src/components/dashboard/actions.ts` |
| `getCachedGroupTypes(ids)` | 24h | `group-types` | `src/services/dashboardService.ts` |
| `getCachedEventTypes(ids)` | 24h | `event-types` | `src/services/dashboardService.ts` |

### Suspense & PPR Pattern for Pages

Pages with dynamic data access (`params`, `searchParams`, `headers()`) must use the Suspense pattern:

```typescript
// Sync wrapper — pre-renders as static HTML shell
export default function MyPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MyPageContent searchParams={searchParams} />
    </Suspense>
  );
}

// Async inner component — streams at request time
async function MyPageContent({ searchParams }: Props) {
  const params = await searchParams;
  return <ClientComponent data={params} />;
}
```

For pages that call `'use cache'` functions but depend on runtime APIs (e.g., dashboard), use `connection()` from `next/server` to skip build-time prerendering:

```typescript
import { connection } from 'next/server';

async function DashboardContent() {
  await connection(); // Defer to runtime — API not available at build time
  const data = await getCachedData();
  return <Dashboard data={data} />;
}
```

### Layout Auth Pattern

The web layout wraps `AuthWrapper` (which uses `headers()`) in a Suspense boundary so the outer HTML shell pre-renders:

```typescript
<Suspense fallback={<Loading />}>
  <AuthWrapper>
    <Providers>{children}</Providers>
  </AuthWrapper>
</Suspense>
```

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

## Dev-Only vs Production Navigation

Some features are dev/demo tools and are **hidden in production builds**. They are gated behind `process.env.NODE_ENV === "development"` in:
- `src/app/(web)/page.tsx` — home page cards
- `src/components/layout/sidebar.tsx` — sidebar nav items

**Currently dev-only:**
- Contact Lookup (`/contactlookup`)
- Template Tool (`/tools/template`)

**Visible in all environments:**
- Executive Dashboard (`/dashboard`)
- Volunteer Processing (`/volunteer-processing`) — both "New Volunteers In Process" and "Approved Active Volunteers" tabs

The routes themselves still exist in production — they're just not linked from the UI. When a dev-only feature is promoted to production, move it out of the `isDev` gate in the relevant files.

## Import Patterns

```typescript
// Feature components (using barrel exports)
import { ContactLookup } from '@/components/contact-lookup';

// Application DTOs
import { ContactSearch, ContactLookupDetails } from '@/lib/dto';

// Ministry Platform models (generated)
import { ContactLog, Congregation } from '@/lib/providers/ministry-platform/models';

// Ministry Platform Zod schemas (for runtime validation)
import { ContactLogSchema } from '@/lib/providers/ministry-platform/models';

// Service classes (used in server actions)
import { ContactService } from '@/services/contactService';

// Auth - server-side (used in server actions and server components)
import { auth } from '@/lib/auth';
import { requireSession, getMpUserId, getUserGuid } from '@/lib/auth-helpers';

// Auth - client-side (used in "use client" components)
import { authClient } from '@/lib/auth-client';

// React contexts
import { UserProvider, useUser } from '@/contexts';

// Ministry Platform helper (used by services, not directly by components)
import { MPHelper } from '@/lib/providers/ministry-platform';

// Feature-specific actions (relative path within same folder)
import { searchContacts } from './actions';

// Layout components (barrel export)
import { AuthWrapper, Header, Sidebar, DynamicBreadcrumb } from '@/components/layout';

// Shared actions (used across multiple features)
import { getCurrentUserProfile } from '@/components/shared-actions/user';

// Named exports (required)
export function MyComponent() { ... }  // ✅ Correct
export default MyComponent;            // ❌ Avoid
```

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
- `SmallGroupTrends` — monthly only

When adding new time-series charts, use the same `toLocaleDateString('en-US', ...)` pattern with the options above.

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

## Memory & Context Management

AI assistants should maintain context files in `.claude/` to track project state:

### Context Files

- **[work-in-progress.md](.claude/work-in-progress.md)** - Current implementation status, known issues, recent changes
- **[session-summary-YYYY-MM-DD.md](.claude/)** - Dated session summaries (create new file per session)
- **[community-attendance-debugging.md](.claude/community-attendance-debugging.md)** - Feature-specific debugging notes
- **[ideas.md](.claude/ideas.md)** - Feature ideas & improvements, syncs bidirectionally with GitHub Issues
- **[references/components.md](.claude/references/components.md)** - Component inventory
- **[references/ministryplatform.schema.md](.claude/references/ministryplatform.schema.md)** - DB schema (auto-generated)

### Update Workflow

**When to update context files:**
1. **Before every push to remote** → Update `session-summary-YYYY-MM-DD.md` with what was committed and pushed
2. **Before creating PRs** → Ensure `session-summary-YYYY-MM-DD.md` and `work-in-progress.md` are up to date and included in the PR
3. **After completing significant features** → Update `work-in-progress.md` with current status
4. **When fixing bugs** → Update feature-specific debugging docs
5. **When patterns change** → Update this CLAUDE.md file

**Key rule**: Session notes are updated **incrementally as work happens**, not batched at the end. Every `git push` should include updated session notes reflecting the changes being pushed.

**Detecting session end:**
- AI assistants cannot automatically detect session end
- **Respond to user cues**: "thanks", "that's all", "we're done", "end of session"
- **User can request**: "Create a session summary" or "Update context files"
- At session end, ensure the session summary is complete and committed

**What to include in session summaries:**
- File paths with line numbers for changes
- Algorithm/approach descriptions
- Before/after comparisons for significant refactors
- Known issues and their status
- Testing notes and verification steps
- Files modified organized by category (Core Logic, Components, Documentation)

**Best practices:**
- Keep dated session summaries separate (don't overwrite old ones)
- Update `work-in-progress.md` as single source of truth for current state
- Use clear status markers: ✅ COMPLETED, ⚠️ IN PROGRESS, ❌ BLOCKED
- Session summaries are historical records; work-in-progress is living document
- **IMPORTANT**: Before every commit, run through this checklist:
  1. **CLAUDE.md check**: Do any of the changes introduce new patterns, conventions, workflows, naming standards, or architectural decisions that should be documented in CLAUDE.md? If so, update it in the same commit. Examples: new file naming conventions, new component patterns, new CLI commands, new environment variables, new label/section mappings, new API patterns.
  2. Update `session-summary-YYYY-MM-DD.md` with what is being committed
  3. Update `work-in-progress.md` if implementation status changed
  4. Include all updated context files in the commit
  5. This ensures documentation stays in sync with code changes at every commit, not just at session end

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
- **ideas.md is included in session pushes** alongside session summaries and work-in-progress updates

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

- **[Components Reference](.claude/references/components.md)** - Detailed inventory of all components, their purposes, server actions, and compliance status
- **[Ministry Platform Schema](.claude/references/ministryplatform.schema.md)** - Auto-generated summary of Ministry Platform database tables, primary keys, and foreign key relationships
