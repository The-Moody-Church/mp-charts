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

**MANDATORY**: Before creating any PR, perform a security review of all changed files in the branch. This replaces an automated CI check — it must happen during development.

**Steps:**
1. Run `git diff main...HEAD --name-only` to list all changed files
2. For each changed file, review against the checklist below
3. Include a "Security Review" section in the PR description summarizing what was checked and any findings

**Checklist — check every changed file for:**

**Critical (must fix before PR):**
- [ ] Filter injection: Any string interpolated into a `filter:` parameter without `sanitizeFilterValue()`, `sanitizeIds()`, or `sanitizeGuid()` from `@/lib/providers/ministry-platform/utils/filter-sanitize`
- [ ] Open redirects: User-supplied URLs used for redirects without validation
- [ ] Missing authentication: Server actions without `requireSession()` call before data access
- [ ] Hardcoded secrets or credentials

**High (must fix before PR):**
- [ ] PII logged via `console.log` — contact records, emails, phones, notes, request/response bodies
- [ ] File uploads without MIME type validation (`ALLOWED_IMAGE_TYPES` / `ALLOWED_DOCUMENT_TYPES`)
- [ ] Missing input validation on user-supplied IDs (NaN, type coercion, negative numbers)

**Medium (flag in PR description):**
- [ ] New endpoints accepting record IDs without per-record authorization (IDOR risk)
- [ ] Verbose logging not gated behind `NODE_ENV === 'development'`
- [ ] New dependencies added (check `npm audit` output)

**PR description format:**
```markdown
## Security Review
- **Files reviewed**: N files
- **Issues found**: None | N issues (list them)
- **Checklist**: All critical/high items pass
- **Notes**: (any medium-severity items or architectural observations)
```

Refer to `.claude/notes/security-audit-2026-02-24.md` for the full audit report and the "Security Best Practices" section below for detailed rules and code examples.

### Pre-PR Issue & Ideas Sync

**MANDATORY**: Before creating a PR, check whether the branch's changes close or advance any GitHub issues, and update `.claude/ideas.md` accordingly.

**Steps:**
1. Review the commits in the branch (`git log main..HEAD --oneline`) and identify which issues are addressed
2. Check open issues: `gh issue list --repo The-Moody-Church/mp-charts --state open`
3. For each issue that the branch **fully resolves**:
   - Mark the corresponding entry in `.claude/ideas.md` as completed: `### ~~Title ([#N](url))~~ ✅ COMPLETED`
   - Move it below all incomplete entries in its section
   - Add or update the description to summarize what was done
4. For issues that are **partially addressed** or need more detail, update the ideas.md entry body text to reflect current status
5. Include the updated `ideas.md` in the PR's final commit

This ensures ideas.md stays accurate and the GitHub Actions sync will close resolved issues on push to main.

### Upstream Sync

This fork tracks `MinistryPlatform-Community/MPNext`. Upstream changes are reviewed periodically and cherry-picked selectively — we do **not** merge upstream directly, since the fork has intentionally diverged (e.g., Next.js 16 — upstream recently upgraded to 16 as well).

To check for new upstream changes:

```bash
git fetch upstream
git log main..upstream/main --oneline
```

Or review PRs at: https://github.com/MinistryPlatform-Community/MPNext/pulls

#### Last Review: 2026-02-28

Reviewed all open/merged upstream PRs through PR #52 (release v2026.02.28.1353). Status:

| PR | Title | Action | Notes |
|----|-------|--------|-------|
| #37 | Security patches (Next.js + React) | Incorporated | Already on Next.js 16; `react`/`react-dom` at `^19.2.4` exceeds the `≥19.1.0` pin |
| #38 | Dependency version updates | Incorporated | Bumped minimum pinned versions for all packages including lucide-react |
| #39 | sanitizeTypeName digit-leading fix | Already incorporated | Same fix as #40; our `sanitizeTypeName` already prefixes `_` for digit-leading names |
| #40 | Generator fix for digit-leading names | Incorporated | `sanitizeTypeName` prefixes `_` when result starts with a digit |
| #41 | Upgrade to Next.js 16 + all deps | Incorporated | Already on Next.js 16; cherry-picked: `middleware.ts` → `proxy.ts` rename, removed unused `@eslint/eslintrc`. Bumped all deps to match upstream pins: zod v4, openai v6, dotenv v17, @types/node ^25, jsdom ^28, all Radix UI, tailwindcss ^4.2, typescript ^5.9.3, and 10+ more |
| #42 | Docs + `@inquirer/prompts` v8 | Incorporated | Upgraded `@inquirer/prompts` ^7→^8; updated `components.md` layout import patterns. Cherry-picked CLAUDE.md additions: Next.js 16 Notes section, Services Layer + Contexts in Architecture, Data Flow section, service import patterns |
| #45 | Improve test coverage (137→228 tests) | Skipped | Our test suite has diverged; upstream tests cover different features |
| #46 | Testing reference guide | Skipped | We have our own testing docs and patterns |
| #47 | GitHub Actions test workflow + Codecov | Skipped | Upstream-specific CI infrastructure |
| #49 | Restore CODECOV_TOKEN | Skipped | Only relevant with #47 |
| #50 | Load user roles/groups into MPUserProfile | Incorporated | Added `roles`/`userGroups` to MPUserProfile, parallel fetch from `dp_User_Roles`/`dp_User_User_Groups`; kept our `sanitizeGuid()` + `sanitizeIds()` security (upstream doesn't sanitize); kept `requireSession()` in shared action |
| #51 | Update deps + fix security vulns | Incorporated | `npm audit fix` resolved 3 CVEs: rollup CVE-2026-27606 (High), minimatch GHSA-3ppc-4f35-3m26 (High), ajv GHSA-2g4f-4pwh-qvx6 (Moderate). Lockfile-only changes, no `package.json` updates needed |
| #52 | Replace NextAuth refs with Better Auth | Incorporated | Code already aligned (env vars, function names). Cherry-picked: `totalSteps` 10→9 fix in `setup.ts`; updated stale NextAuth references in `docs/OAUTH_LOGOUT_SETUP.md` and `src/lib/providers/ministry-platform/docs/README.md` |

**GitHub will show "N commits behind"** — this is expected and harmless. It reflects diverged commit history, not missing changes.

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

**Note:** Dashboard cache is shared across all authenticated users (not keyed per-user). This is intentional — the dashboard shows aggregate metrics, not per-user data. If user-specific dashboard access is ever needed, the cache would need to be keyed by user or permission level.

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

// Shared processing components (barrel export)
import { PersonAvatar, ProcessingGrid, MilestoneEditForm } from '@/components/processing';

// Shared processing utilities
import { getDisplayName, formatDate, MAX_FILE_SIZE } from '@/lib/processing-utils';

// Shared actions (used across multiple features)
import { getCurrentUserProfile } from '@/components/shared-actions/user';
import { extractValidatedFiles, uploadContactPhoto } from '@/components/shared-actions/processing';

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

## Mobile & Responsive Guidelines

All features must work on mobile (375px+). Use **mobile-first** Tailwind classes and test at iPhone SE width (375px) in Chrome DevTools.

### Viewport Configuration

The `viewport` export in `src/app/(web)/layout.tsx` must include `width: "device-width"` and `initialScale: 1`:

```typescript
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
}
```

### Responsive Hook

Use `useIsMobile()` from `@/hooks/use-mobile` when component **behavior** must change by screen size (e.g., Recharts prop values, conditional rendering). For **layout-only** changes, use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`).

```typescript
import { useIsMobile } from '@/hooks/use-mobile';
const isMobile = useIsMobile(); // true when viewport < 768px (md breakpoint)
```

### Padding & Spacing

| Context | Classes | Rationale |
|---------|---------|-----------|
| Page containers | `p-4 sm:p-6 lg:p-8` | Never `p-8` alone — wastes 64px on a 375px screen |
| Page titles | `text-2xl sm:text-4xl` | `text-4xl` is too large for narrow screens |
| Dialog/modal content | Base is `p-4 sm:p-6` | Set in `dialog.tsx` base component |

### Tab Navigation

When tabs contain long labels (e.g., "New Volunteers In Process"), they overflow on narrow screens. Use responsive classes:

```tsx
<TabsList className="w-full sm:w-fit h-auto">
  <TabsTrigger value="tab1" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
    Long Tab Label
  </TabsTrigger>
</TabsList>
```

| Class | Purpose |
|-------|---------|
| `w-full sm:w-fit` on TabsList | Full-width on mobile, auto-sized on desktop |
| `h-auto` on TabsList | Allows multi-line tab labels to expand height |
| `flex-1 sm:flex-initial` on TabsTrigger | Equal-width tabs on mobile, auto-sized on desktop |
| `whitespace-normal sm:whitespace-nowrap` | Wraps text on mobile, single line on desktop |
| `text-xs sm:text-sm` | Smaller text on mobile to fit labels |

### Form Select Elements

Native `<select>` elements must use `text-base` (16px) on mobile to **prevent iOS Safari auto-zoom** on focus. Browsers zoom when input font size is below 16px.

```tsx
<select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm ...">
```

| Pattern | Implementation |
|---------|---------------|
| **Font size** | `text-base sm:text-sm` — 16px on mobile (prevents iOS zoom), 14px on desktop |
| **Height** | `h-10` (40px) — matches touch-friendly sizing guidelines |

### Chart Standards (Recharts)

All chart components must follow these mobile patterns:

| Pattern | Implementation |
|---------|---------------|
| **Touch-friendly tooltips** | `<Tooltip trigger={isMobile ? 'click' : 'hover'} />` — tap to show, tap elsewhere to dismiss |
| **Tooltip max-width** | Add `maxWidth: '85vw'` to `contentStyle` — prevents tooltip from exceeding viewport |
| **Tooltip dismiss on outside tap** | Handled by `ExpandableChart` wrapper — tapping outside the chart forces a re-mount via React key toggle to clear Recharts' internal tooltip state |
| **Responsive margins** | `margin={{ top: 5, right: isMobile ? 5 : 20, left: isMobile ? 5 : 20, bottom: 5 }}` |
| **Hide legend on mobile** | `{!isMobile && <Legend />}` — lines are identifiable by color; legend wastes vertical space |
| **Hide secondary Y-axis** | For dual-axis charts: `{!isMobile && <YAxis yAxisId="right" ... />}` |
| **Hide pie chart labels** | `label={isMobile ? false : renderLabel}` — labels overlap on small screens |
| **Horizontal bar Y-axis width** | `width={isMobile ? 80 : 150}` — 150px is 40% of a 375px screen |
| **Empty state heights** | Use `style={{ height }}`, **not** `` h-[${height}px] `` — Tailwind can't compile dynamic values |

**ExpandableChart wrapper** (`src/components/dashboard/expandable-chart.tsx`): All dashboard charts are wrapped in this component. On mobile, click-to-expand on the chart area is disabled to avoid intercepting Recharts' click-triggered tooltips — users tap the expand icon button instead. The wrapper also handles tooltip dismiss: a `pointerdown` listener on `document` detects taps outside the chart container and increments a React key to force the chart to re-mount, clearing the tooltip. Do **not** try to dismiss tooltips via Recharts' `onClick` prop or `active` prop override — these interfere with Recharts' internal tooltip state management.

### Dialog & Modal Standards

| Pattern | Implementation |
|---------|---------------|
| **Base padding** | `p-4 sm:p-6` (set in `dialog.tsx`) |
| **Wide modals (max-w-2xl)** | Add `w-[calc(100vw-1rem)]` before `sm:max-w-2xl` to prevent overflow |
| **Modal close button** | Base `DialogContent` includes an X button at `right-4 top-4` — always accessible |

### Form Layout Standards

| Pattern | Implementation |
|---------|---------------|
| **Side-by-side fields** | `flex flex-col sm:flex-row` — stacks vertically on mobile |
| **Fixed-width inputs** | `w-full sm:w-36` — full width on mobile, fixed on desktop |
| **Badge/icon rows** | Always include `flex-wrap` — prevents horizontal overflow |

### Touch Interaction Standards

- **Never rely solely on `:hover`** for critical UI. Use `opacity-60 sm:opacity-0 sm:group-hover:opacity-100` for reveal buttons.
- **Interactive SVG elements** need `onClick` alongside `onMouseEnter`/`onMouseLeave` for tap support.
- **Recharts tooltips** must use `trigger={isMobile ? 'click' : 'hover'}` — default hover tooltips are unusable on touch devices.

### Anti-Patterns to Avoid

```typescript
// ❌ Dynamic Tailwind classes — won't be compiled
<div className={`h-[${height}px]`}>

// ✅ Use inline style for dynamic values
<div style={{ height }}>

// ❌ Fixed padding on all breakpoints
<div className="p-8">

// ✅ Mobile-first responsive padding
<div className="p-4 sm:p-6 lg:p-8">

// ❌ Wide modal without mobile constraint
<DialogContent className="max-w-2xl">

// ✅ Viewport-aware modal width
<DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl">

// ❌ Fixed Y-axis width on horizontal bar chart
<YAxis width={150} />

// ✅ Responsive Y-axis width
<YAxis width={isMobile ? 80 : 150} />

// ❌ Hover-only button visibility
className="opacity-0 group-hover:opacity-100"

// ✅ Touch-friendly visibility
className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100"

// ❌ Small select font (causes iOS auto-zoom)
<select className="text-xs">
<select className="text-sm">

// ✅ 16px base prevents iOS auto-zoom, smaller on desktop
<select className="text-base sm:text-sm h-10">

// ❌ Fixed-width tabs that overflow on mobile
<TabsList>
  <TabsTrigger>Long Tab Label Here</TabsTrigger>
</TabsList>

// ✅ Responsive tabs that wrap and fit mobile
<TabsList className="w-full sm:w-fit h-auto">
  <TabsTrigger className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
    Long Tab Label Here
  </TabsTrigger>
</TabsList>

// ❌ Trying to dismiss Recharts tooltips via onClick/active prop
<BarChart onClick={() => setActive(false)}>
  <Tooltip active={active} />
</BarChart>

// ✅ Let ExpandableChart handle tooltip dismiss via key toggle
// (no extra code needed in individual chart components)
```

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

This project handles **PII** (names, emails, phones, dates of birth, background check data). All code must follow these security practices. These rules apply during development — catch issues at write time, not in review.

### Filter & Query Safety

Ministry Platform's REST API accepts OData-style `$filter` parameters that map to SQL WHERE clauses. **Never interpolate raw strings into filters.**

```typescript
import { sanitizeFilterValue, sanitizeIds, sanitizeGuid } from "@/lib/providers/ministry-platform/utils/filter-sanitize";

// ✅ LIKE clauses — escape single quotes
const safe = sanitizeFilterValue(userInput);
filter: `Last_Name LIKE '%${safe}%'`

// ✅ IN clauses — validate all IDs are finite positive numbers
filter: `Contact_ID IN (${sanitizeIds(ids)})`

// ✅ GUID values — validate format before interpolation
const validGuid = sanitizeGuid(guid);
filter: `Contact_GUID = '${validGuid}'`

// ❌ NEVER do this — allows filter injection
filter: `Last_Name LIKE '%${search}%'`          // breaks on O'Brien, injectable
filter: `Contact_ID IN (${ids.join(',')})`       // no numeric validation
filter: `User_GUID = '${profile.sub}'`           // no format validation
```

**Rule**: Every string interpolated into a `filter:` parameter MUST pass through a sanitization function from `filter-sanitize.ts`. This applies to:
- User search input → `sanitizeFilterValue()`
- Arrays of IDs (even from DB results) → `sanitizeIds()` or `sanitizeIdsOptional()`
- GUIDs (even from trusted sources like OIDC) → `sanitizeGuid()`

### File Upload Validation

All file upload endpoints must validate MIME type **and** file size on the server side:

```typescript
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];

// ✅ Validate before processing
if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
  return { success: false, error: `Invalid file type: ${file.type}` };
}

// ❌ NEVER skip MIME validation — size checks alone are insufficient
```

### URL & Redirect Safety

Never use user-supplied URLs for redirects without validation:

```typescript
// ✅ Validate callback URLs are relative paths
function getSafeCallbackUrl(url: string | null): string {
  if (!url) return "/";
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("://")) {
    return url;
  }
  return "/";
}

// ❌ NEVER redirect to unvalidated URLs
window.location.href = searchParams.get("callbackUrl");  // open redirect
```

### Logging & PII

**Never log PII in production.** This includes contact records, emails, phone numbers, notes, and any data from Ministry Platform tables that contain personal information.

```typescript
// ✅ Log operation context, not data
console.error("Error updating contact:", error);

// ✅ Gate verbose logging behind NODE_ENV
if (process.env.NODE_ENV === 'development') {
  console.log("Debug:", data);
}

// ❌ NEVER log PII
console.log("Contact:", JSON.stringify(record));         // leaks email, phone
console.log("HTTP PUT:", JSON.stringify(body, null, 2)); // leaks request payloads
```

### Authentication & Authorization

- Every server action MUST call `requireSession()` before any data access
- Use `getMpUserId(session)` for audit attribution on write operations
- The proxy (`src/proxy.ts`) protects routes but only checks session presence — it does not check roles
- IDOR risk: server actions accept record IDs from clients without per-record authorization. When adding new endpoints that access sensitive data, consider whether the requesting user should have access to that specific record

### Security Headers

Security headers are configured in `next.config.ts` via the `headers()` function. When modifying, ensure these headers remain present:
- `X-Frame-Options: DENY` — prevents clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Strict-Transport-Security` — enforces HTTPS
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — disables unused browser APIs

### Rate Limiting

Server actions are rate-limited per authenticated user via `src/lib/rate-limit.ts` (in-memory sliding window). The general limit is enforced automatically in `requireSession()`; stricter tiers must be called explicitly with `enforceRateLimit()`:

```typescript
import { enforceRateLimit } from "@/lib/rate-limit";

// In a write server action:
const session = await requireSession(); // ← auto-enforces "general" (120/min)
enforceRateLimit(session.user.id, "write"); // ← explicit stricter limit (30/min)
```

| Tier | Limit | Window | Applied to |
|------|-------|--------|------------|
| `general` | 120 req | 1 min | All server actions (via `requireSession()`) |
| `write` | 30 req | 1 min | Create/update/delete operations |
| `upload` | 10 req | 10 min | Photo and document uploads |
| `search` | 30 req | 1 min | Contact search (PII access) |
| `cacheRefresh` | 5 req | 1 hour | Dashboard cache invalidation |

When adding new server actions:
- **Read-only actions**: No extra work — `requireSession()` handles the general limit
- **Write actions**: Add `enforceRateLimit(session.user.id, "write")` after `requireSession()`
- **File uploads**: Add `enforceRateLimit(session.user.id, "upload")` after `requireSession()`

### Security Audit Reference

The full security audit report is at `.claude/notes/security-audit-2026-02-24.md`. It documents all 15 findings, their status, and remaining open items (RBAC, IDOR mitigation).

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
2. **Session summary**: Update `.claude/sessions/session-summary-YYYY-MM-DD.md` with what's being committed.
3. **ideas.md**: If any issues were completed, update `.claude/ideas.md` (see "Ideas & Issue Tracking" section).
4. **status.md**: After merging a PR, update `.claude/status.md` to reflect the completed work and current project state.
5. Include all updated context files in the commit.

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
