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
   - Mark the corresponding entry in `docs/ideas.md` as completed: `### ~~Title ([#N](url))~~ ✅ COMPLETED`
   - Move it below all incomplete entries in its section
   - Add or update the description to summarize what was done
4. For issues that are **partially addressed** or need more detail, update the ideas.md entry body text to reflect current status
5. Update `docs/status.md` — move work from "In Progress" to "Recently Completed" (or add a new entry)
6. Update `docs/sessions/session-summary-YYYY-MM-DD.md` with final session status
7. Commit all updated context files (`ideas.md`, `status.md`, session summary) **on the feature branch** before merging

This ensures context files are part of the PR's commit history and ideas.md stays accurate for the GitHub Actions sync.

### Upstream Sync

This fork tracks `MinistryPlatform-Community/MPNext`. Upstream changes are reviewed periodically and cherry-picked selectively — we do **not** merge upstream directly. **GitHub will show "N commits behind"** — this is expected and harmless.

Sync instructions and review history: `.claude/notes/upstream-sync-log.md`

### Auto-Commit `.claude/settings.local.json`

When committing changes, if `.claude/settings.local.json` has pending modifications, include it in the commit. This file tracks Claude Code permission settings and should stay in sync.

### Branch Before Committing Code Changes

**Never commit code changes directly to `main`.** If the changes include any source code (`.ts`, `.tsx`, `.js`, `.css`, config files, etc.), stop and ask the user whether to create a feature branch before committing.

- **Documentation-only changes** (`.md` files, `.claude/` context files, `docs/` context files, `ideas.md`) **may** be committed directly to `main`.
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
- **Services Layer**: Singleton service classes in `src/services/` wrap MPHelper for domain logic (ContactService, ContactLogService, ComplianceProcessingService, DashboardService, FeedbackService, JourneyProcessingService, MemberService, UserService)
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

### Custom Cache Handler

**IMPORTANT**: The default Next.js in-memory cache handler **ignores `cacheLife({ stale })` entirely**. It expires entries at `revalidate` time (6h) and returns `undefined` — a full cache miss — instead of serving stale data. This caused 30+ second cold cache fetches every 6 hours.

A custom handler at `cache-handler.js` (configured via `cacheHandlers.default` in `next.config.ts`) fixes this by using the `expire` field (revalidate + stale = 30h) as the true expiry. Between 6h and 30h, it returns cached data with `revalidate: -1`, which tells the framework to serve stale data instantly while revalidating in the background.

**CRITICAL — `get()` must check `memoryCache` before `pendingSets`.** When the framework triggers a background revalidation, it calls `set(key, pendingEntry)` which adds the key to `pendingSets` for the full duration of the data fetch (20-40 seconds). If `get()` awaits `pendingSets` first, ALL requests during revalidation are blocked — completely defeating stale-while-revalidate. The handler checks `memoryCache` first and returns stale data immediately; it only awaits `pendingSets` when there is no cached data at all (e.g., initial cache warm).

**Note**: The cache is still in-memory (LRU, 50MB). Container restarts wipe the cache — cache warming on startup (`instrumentation.ts`) repopulates it within ~60s. The custom handler ensures stale-while-revalidate works correctly *within* a container's lifetime.

### Service-Layer Cache (Safety Net)

A simple in-memory `Map`-based cache (`src/lib/service-cache.ts`) sits inside every `'use cache'` function as a safety net. It guarantees sub-second responses regardless of what the `'use cache'` framework does (pendingSets blocking, LRU eviction, stream corruption, tag expiry edge cases).

**How it works**: `serviceCache.getOrFetch(key, ttlMs, fetcher)` returns cached data instantly if available. On first call (cold miss), it awaits the fetcher and stores the result. After `ttlMs`, it returns stale data immediately and refreshes in the background (non-blocking). Failed refreshes keep old data — data is never lost.

**CRITICAL — `globalThis` singleton**: The `serviceCache` instance uses `globalThis.__serviceCache` to survive Turbopack chunk splitting. Without this, each compiled chunk gets its own `ServiceCache` instance — cache warming populates one, but user requests hit a different (empty) one. This is the standard Next.js pattern for in-process singletons (same as Prisma). Do NOT change the export to `new ServiceCache()` directly.

**MANDATORY**: Every `'use cache'` function must wrap its data fetch with `serviceCache.getOrFetch()`. The service cache key should match the cache tag or be descriptively unique. Use `CACHE_TTL.STANDARD` (6h) or `CACHE_TTL.LONG` (24h) from the same module.

```typescript
import { serviceCache, CACHE_TTL } from '@/lib/service-cache';

export async function getCachedData(key: string) {
  'use cache';
  cacheLife({ revalidate: 21600 });
  cacheTag('my-tag');
  return serviceCache.getOrFetch(`my-tag:${key}`, CACHE_TTL.STANDARD, async () => {
    // ... slow fetch ...
  });
}
```

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
- Invalidate with `updateTag('my-tag')` from server actions (serves stale data while revalidating in background; use `revalidateTag('my-tag', { expire: 0 })` only when stale data must NOT be served)
- **NEVER use `revalidatePath()` alongside `updateTag()`** — `revalidatePath` hard-purges the page's PPR shell, forcing a full re-render (10+ seconds). `updateTag` alone is sufficient for data invalidation.

**Current cached functions:**
| Function | Revalidate | Stale | Tags | File |
|---|---|---|---|---|
| `getCachedDashboardData(year)` | 6h | 24h | `dashboard-data`, `year-N` | `src/components/dashboard/cached-data.ts` |
| `getCachedFullRangeData(year, endDate)` | 6h | 24h | `dashboard-data`, `dashboard-full-range` | `src/components/dashboard/cached-data.ts` |
| `getCachedExtendedData(start, end)` | 6h | 24h | `dashboard-data`, `dashboard-extended` | `src/components/dashboard/cached-data.ts` |
| `getCachedEngagementData(start, end)` | 6h | 24h | `dashboard-data`, `dashboard-engagement` | `src/components/dashboard/cached-data.ts` |
| `getCachedGroupTypes(ids)` | 24h | 48h | `group-types` | `src/services/dashboardService.ts` |
| `getCachedAllContacts()` | 6h | 24h | `contacts-search` | `src/components/contact-lookup/cached-contacts.ts` |

All cached functions use **stale-while-revalidate**: after the revalidate TTL expires, stale data continues to be served instantly while fresh data is computed in the background. This prevents users from ever hitting a cold cache during normal operation. The `stale` column shows how long expired data remains servable.

**IMPORTANT — Cache keys must be stable.** Dashboard cache keys use end-of-ministry-year (Aug 31) instead of today's date, so they change only once per year (at ministry year rollover in September). If a cache key changes daily, stale-while-revalidate can't serve stale data after midnight because the new key has no stale entry — causing cold cache misses. Service methods that iterate over months (e.g., `getMonthlyAttendanceTrends`, `getEngagementRawData`) cap their iteration at `new Date()` internally to avoid wasting API calls on future months.

**Note:** Dashboard cache is shared across all authenticated users (not keyed per-user). This is intentional — the dashboard shows aggregate metrics, not per-user data. If user-specific dashboard access is ever needed, the cache would need to be keyed by user or permission level.

**CRITICAL — Never silently return empty data in cached code paths.** If a function called within a `'use cache'` boundary catches an error and returns a fallback (e.g., `return []`), that fallback gets cached as a valid result — overwriting previously good stale data. Instead:
- **Let errors propagate** (throw) so stale-while-revalidate serves the previous good value
- If partial failure is possible (e.g., fetching many months in parallel), use `Promise.allSettled` to keep successful results, and only throw when ALL sub-tasks fail
- See `getMonthlyAttendanceTrends` in `dashboardService.ts` for the reference pattern

### Cache Warming

Caches are **pre-warmed automatically on server start** and **re-warmed daily at 6:00 AM Central Time** so users never hit a cold cache.

**How it works:**
1. `src/instrumentation.ts` — `register()` runs on server start, generates a random token on `process.env`, polls `/api/cache-warm` until the server is ready, then schedules daily re-warming at 6:00 AM CT via `setTimeout`/`setInterval`
2. `src/app/api/cache-warm/route.ts` — Verifies the runtime token, calls `warmAllCaches()` within the Next.js request context (required for `'use cache'` functions)
3. `src/lib/cache-warming.ts` — Central registry that calls every `'use cache'` function with the correct parameters

Cache warming runs automatically on every server start and daily at 6:00 AM CT — no configuration required. The endpoint is protected by a per-process random token shared via `process.env.__CACHE_WARM_TOKEN`.

**Adding a new cached function — MANDATORY steps:**
1. Create the `'use cache'` function in a non-`'use server'` file (so it can be imported by the warming module)
2. Wrap the data fetch with `serviceCache.getOrFetch()` from `@/lib/service-cache` (see "Service-Layer Cache" section above)
3. Register it in `src/lib/cache-warming.ts` → `warmAllCaches()` with the correct parameters
4. Update the "Current cached functions" table above
5. Add a comment at the top of the source file pointing to `cache-warming.ts`

```typescript
// Example: registering a new cached function in cache-warming.ts
import { getCachedNewData } from '@/components/feature/cached-data';

export async function warmAllCaches(): Promise<WarmingResult[]> {
  const results = await Promise.all([
    // ... existing entries ...
    warmOne('getCachedNewData', () => getCachedNewData(params)),
  ]);
  return results;
}
```

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

**Merging same-day entries**: When both years have data on the same day-of-month, merge into a **single x-axis point** using a `Map` keyed by MM-DD. Never create duplicate x-axis entries for the same MM-DD. See `AttendanceChart` for the reference implementation.

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

**Sending dates to MP**: Pass ISO datetime through Zod validation, then convert to Central Time SQL format in the **service layer** using `Intl.DateTimeFormat` with `timeZone: "America/Chicago"`. Do NOT use `getHours()`/`getMinutes()` — those use server-local time, which is UTC in Docker. Reference implementation: `isoToCentralSql()` in `contactLogService.ts`. For date-only values (no meaningful time), use noon UTC (`T12:00:00.000Z`) so the date stays correct after Central conversion regardless of DST.

## Validation Best Practices

When working with Ministry Platform data:

```typescript
import { ContactLogSchema } from '@/lib/providers/ministry-platform/models';

// ✅ Validate on create
await mp.createTableRecords('Contact_Log', records, { schema: ContactLogSchema, $userId });

// ✅ Partial validation for updates (default: partial: true)
await mp.updateTableRecords('Contact_Log', records, { schema: ContactLogSchema, $userId });

// ✅ Strict validation (all fields required)
await mp.updateTableRecords('Contact_Log', records, { schema: ContactLogSchema, partial: false, $userId });
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

All file upload endpoints must validate MIME type **and** file size on the server side. Limits match Ministry Platform: **20 MB max**, standard file formats (PNG, JPG, BMP, GIF, PDF, TXT, CSV):

```typescript
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain', 'text/csv'];

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

AI assistants maintain context files across two directories:
- **`docs/`** — Session output artifacts (summaries, ideas, status) that change frequently. Lives outside `.claude/` so Claude Code can read/write freely without permission prompts.
- **`.claude/`** — Claude Code configuration (settings, commands, plans, notes, references).

### Folder Structure

```
docs/
├── status.md             # Quick-reference project status (read first at session start)
├── sessions/             # Dated session summaries (one per session)
│   └── session-summary-YYYY-MM-DD.md
└── ideas.md              # Feature ideas & improvements (syncs with GitHub Issues)

.claude/
├── plans/                # Implementation plans and draft issue specs
├── notes/                # Debugging notes, audit reports, reference docs
├── references/           # Auto-generated schema, component inventory
│   ├── components.md
│   └── ministryplatform.schema.md
├── commands/             # Claude Code slash commands
└── settings.local.json   # Claude Code permission settings
```

### Status File

`docs/status.md` is a **lightweight snapshot** of current project state — recently completed work, in-progress items, and open issues. Read it first at session start to orient quickly without scanning all session summaries. Keep it short (under 50 lines). Update it when completing significant work. **Retention: keep only the last 7 days** in the "Recently Completed" table — older entries are preserved in git history and session summaries. When adding a new entry, remove any entries older than 7 days.

### Session Summaries

Each session gets a dated file at `docs/sessions/session-summary-YYYY-MM-DD.md`. Create it at session start with a brief plan. Update continuously: after direction changes, before commits, on key decisions. Include: objectives, issues addressed (`#N`), files changed, decisions + rationale, follow-ups. Use status markers: ✅ COMPLETED, ⚠️ IN PROGRESS, ❌ BLOCKED.

### Pre-Commit Checklist

Before every commit (on ANY branch):

1. **CLAUDE.md check**: Do the changes introduce new patterns, conventions, or architectural decisions? If so, update CLAUDE.md in the same commit.
2. **README.md check**: Do the changes affect anything documented in README.md? This includes: new/removed features, changed auth or env vars, new routes or components, updated services, changed project structure, or modified setup steps. If so, update README.md in the same commit.
3. **Session summary**: Update `docs/sessions/session-summary-YYYY-MM-DD.md` with what's being committed.
4. **ideas.md**: If any issues were completed, update `docs/ideas.md` (see "Ideas & Issue Tracking" section).
5. **status.md**: Update `docs/status.md` to reflect completed work **before merging the PR** (not after on `main`). This ensures context files are part of the merged branch's history.
6. Include all updated context files in the commit.

## Ideas & Issue Tracking

Feature ideas, improvements, and tech debt are tracked in `docs/ideas.md`. This file syncs **bidirectionally** with GitHub Issues via a GitHub Actions workflow (`.github/workflows/sync-issues-to-ideas.yml`).

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

Within each section, order: **incomplete items first** (newest on top), **completed items last** (~~strikethrough~~ ✅ at bottom). New entries go as the first `###` after the `## Section` header. Labels map to sections: `feature` → Features, `improvement` → Improvements, `tech-debt` → Technical Debt.

## Reference Documents

For detailed context on specific areas, see:

- **[Project Status](docs/status.md)** - Quick-reference snapshot of current state (read first at session start)
- **[Components Reference](.claude/references/components.md)** - Detailed inventory of all components, their purposes, server actions, and compliance status
- **[Ministry Platform Schema](.claude/references/ministryplatform.schema.md)** - Auto-generated summary of Ministry Platform database tables, primary keys, and foreign key relationships
- **[Security Audit](.claude/notes/security-audit-2026-02-24.md)** - Full security audit report with 15 findings
