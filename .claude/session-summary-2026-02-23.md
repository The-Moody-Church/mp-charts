# Session Summary — 2026-02-23

## Cache Components Migration: `unstable_cache` → `'use cache'` + PPR (Issue #21)

### Task
Investigated feasibility, then implemented full migration from `unstable_cache` to `'use cache'` with `cacheComponents: true` (PPR) in Next.js 16 stable.

### Implementation Summary

Chose **Option B** (`cacheComponents: true`) — the full Cache Components upgrade with Partial Prerendering. All authenticated pages now show `◐ (Partial Prerender)` in build output — static HTML shells load instantly, dynamic content streams via Suspense.

### Changes Made

#### 1. Enable Cache Components
- **`next.config.ts`** — Added `cacheComponents: true`

#### 2. Migrate 4 `unstable_cache` call sites to `'use cache'`

**`src/components/dashboard/actions.ts`**:
- `getCachedDashboardData(ministryYear)` → `'use cache'` + `cacheLife({ revalidate: 21600 })` + `cacheTag('dashboard-data', 'year-N')`
- `getCachedFullRangeData(earliestYear, endDateIso)` → same pattern; moved `new Date()` OUT of cache boundary into caller `getFullRangeDashboardMetrics()`, passing end date as ISO string parameter
- Removed `unstable_cache` import, added `cacheLife, cacheTag` imports
- `refreshDashboardCache()` — kept `revalidateTag()` with `{ expire: 0 }` (compatible)

**`src/services/dashboardService.ts`**:
- `getCachedGroupTypes(ids)` → `'use cache'` + `cacheLife({ revalidate: 86400 })` + `cacheTag('group-types')`
- `getCachedEventTypes(ids)` → same pattern
- Removed double-invoke pattern (`getCachedGroupTypes(ids)()` → `getCachedGroupTypes(ids)`)
- Updated JSDoc references from "unstable_cache" to "'use cache'"

#### 3. Add Suspense boundaries for PPR

**`src/app/(web)/layout.tsx`**:
- Wrapped `<AuthWrapper>` in `<Suspense>` (uses `headers()` — per-request dynamic data)
- Removed unnecessary `async` keyword (layout has no await)

**`src/app/(web)/dashboard/page.tsx`**:
- Split into sync `DashboardPage` wrapper + async `DashboardContent` inner component
- `DashboardContent` wrapped in `<Suspense>`, uses `await connection()` to skip build-time prerender (API not available during build)
- Updated BUILD_ID to `cache-components-v1`

**`src/app/(web)/volunteer-processing/page.tsx`**:
- Split into sync `VolunteerProcessingPage` + async `VolunteerProcessingContent`
- Wrapped in `<Suspense>` (uses `searchParams` — dynamic API)

**`src/app/(web)/contactlookup/[guid]/page.tsx`**:
- Split into sync `ContactLookupDetailPage` + async `ContactLookupDetailContent`
- Wrapped in `<Suspense>` (uses dynamic `params`)

**`src/app/(web)/tools/template/page.tsx`**:
- Split into sync `TemplateToolPage` + async `TemplateToolContent`
- Wrapped in `<Suspense>` (uses `searchParams` + async service call)

**`src/app/layout.tsx`**:
- Removed unnecessary `async` keyword

#### 4. Documentation Updates

**`CLAUDE.md`**:
- Updated Architecture line to include "Cache Components/PPR"
- Added comprehensive "Caching & PPR" section with `'use cache'` patterns, Suspense/PPR patterns, and layout auth pattern

**`.claude/ideas.md`**:
- Marked issue #21 as `✅ COMPLETED (2026-02-23)`

**`.claude/plan-baptism-processing.md`**:
- Updated page pattern note to reference PPR/Suspense pattern

**`.claude/draft-issue-dashboard-redesign.md`**:
- Added caching architecture section documenting `'use cache'` pattern for new charts

### Build Output

```
Route (app)
┌ ◐ /
├ ○ /_not-found
├ ƒ /api/auth/[...all]
├ ◐ /contactlookup
├ ◐ /contactlookup/[guid]
├ ◐ /dashboard
├ ◐ /home
├ ○ /signin
├ ◐ /tools/template
└ ◐ /volunteer-processing

○  (Static)             prerendered as static content
◐  (Partial Prerender)  prerendered as static HTML with dynamic server-streamed content
ƒ  (Dynamic)            server-rendered on demand
```

### Key Lessons Learned
1. `'use cache'` functions must not contain `new Date()` or other non-deterministic expressions — pass as parameters
2. `'use cache'` functions execute at build time to warm the cache — use `connection()` in the calling component to defer to runtime when the API isn't available during build
3. `cacheComponents: true` automatically enables PPR — every page with uncached dynamic data needs Suspense boundaries
4. `searchParams`, `params`, `headers()`, `cookies()` are dynamic APIs that need Suspense with PPR
5. The double-invoke pattern (`unstable_cache(fn, key, opts)()`) simplifies to direct function call with `'use cache'`

### Files Modified
- `next.config.ts` — added `cacheComponents: true`
- `src/components/dashboard/actions.ts` — migrated 2 `unstable_cache` → `'use cache'`
- `src/services/dashboardService.ts` — migrated 2 `unstable_cache` → `'use cache'`
- `src/app/(web)/layout.tsx` — added Suspense around AuthWrapper
- `src/app/(web)/dashboard/page.tsx` — PPR pattern with `connection()`
- `src/app/(web)/volunteer-processing/page.tsx` — PPR Suspense pattern
- `src/app/(web)/contactlookup/[guid]/page.tsx` — PPR Suspense pattern
- `src/app/(web)/tools/template/page.tsx` — PPR Suspense pattern
- `src/app/layout.tsx` — removed unnecessary `async`
- `CLAUDE.md` — added Caching & PPR section
- `.claude/ideas.md` — marked #21 completed
- `.claude/plan-baptism-processing.md` — updated page pattern note
- `.claude/draft-issue-dashboard-redesign.md` — added caching architecture section
- `.claude/session-summary-2026-02-23.md` — this file

---

## Dashboard Redesign: Remove Dead Code, Make All Metrics Date-Filterable, Split Loading Phases

### Task
Implemented 4-phase refactoring plan from audit of dashboard architecture:
1. Remove dead weight (unused interfaces, methods, dev debug card)
2. Make serving metrics date-filterable (consolidate 4 redundant API calls → 1, compute client-side)
3. Make engagement venn date-filterable (store raw data, compute client-side)
4. Split engagement loading into separate phase (Activity_Log query is slow)

### Changes Made

**Phase 1: Remove Dead Weight**
- Deleted `EventTypeMetrics`, `GivingByProgram`, `GivingTrend` interfaces from DTO
- Removed `uniqueAttendees`/`uniqueInPersonAttendees`/`uniqueOnlineAttendees` from `PeriodMetrics`
- Deleted `getCachedEventTypes`, `getEventTypesWithCache`, `getEventTypeMetrics` (~120 lines), `calculateYearOverYear`, `calculatePercentChange`, `determineTrend` from service
- Removed dev debug card from `dashboard-metrics.tsx`
- Removed `event-types` cache invalidation from `refreshDashboardCache`

**Phase 2: Date-Filterable Serving Metrics**
- Added `ServingLeadingRecord` interface to DTO with date ranges for client-side filtering
- New `getServingLeadingRaw()` service method: single API chain (Group_Roles → Group_Participants → Participants → Role_Types → Ministries), deduplicated per (contactId, roleTypeId, ministryId)
- Deleted 4 old methods: `getServingLeadingParticipants`, `getTotalServingLeading`, `getServingTrends`, `getServingByRoleType`, `getServingByMinistry`
- New `computeServingMetrics()` in filter-dashboard-data.ts: computes servingTrends, servingByRoleType, servingByMinistry, totalServingLeading from raw records

**Phase 3: Date-Filterable Engagement Venn**
- Added `EngagementActivityMonth`, `EngagementGroupRecord`, `EngagementRawData` interfaces
- New `getEngagementRawData()` service method: Activity_Log bucketed by month, Groups (Ministry_ID=8) with date ranges, pre-computed adult filter
- Deleted `getEngagementOverlap`, `getActivityContactIds`, `getGroupContactIds`, `getServingContactIds` (old methods)
- New `computeEngagementOverlap()` in filter-dashboard-data.ts: 7 venn regions via set intersection/difference
- New SVG-based `VennDiagram` component replacing placeholder

**Phase 4: Split Engagement Loading (Activity_Log → Last)**
- `getExtendedDashboardData()` now returns only EP/roster/serving (all parallel, no sequential phase)
- New `getEngagementDashboardData()` public method on service for venn data
- `getEngagementRawData()` now self-contained: fetches serving contact IDs internally via lightweight `getServingContactIds()` helper
- New `getCachedEngagementData()` + `getEngagementDashboardMetrics()` server action with `dashboard-engagement` cache tag
- `DashboardShell` has two independent loading stages: `extendedLoading` (fast) + `engagementLoading` (slow)
- `DashboardMetrics` accepts `engagementLoading` prop — venn skeleton independent from other extended loading

### Files Modified
- `src/lib/dto/dashboard.ts` — removed 3 dead interfaces, added 5 new interfaces, cleaned PeriodMetrics/DashboardData
- `src/services/dashboardService.ts` — removed ~400 lines dead code, added getServingLeadingRaw, getEngagementRawData, getEngagementDashboardData, getServingContactIds
- `src/components/dashboard/filter-dashboard-data.ts` — added computeServingMetrics, computeEngagementOverlap
- `src/components/dashboard/dashboard-metrics.tsx` — removed debug card, added engagementLoading prop
- `src/components/dashboard/dashboard-shell.tsx` — two-stage loading with engagementLoading state
- `src/components/dashboard/actions.ts` — added getCachedEngagementData + getEngagementDashboardMetrics, removed event-types invalidation
- `src/components/dashboard/venn-diagram.tsx` — new SVG-based venn diagram component
