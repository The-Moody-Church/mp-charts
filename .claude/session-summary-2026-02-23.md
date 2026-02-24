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

## Dashboard Redesign: Initial Layout with Discipleship Sections (`1b5d27d`)

### Task
Restructured the executive dashboard from a flat list of metric cards into themed discipleship pathway sections with new chart types and MP data queries.

### Changes Made

**New discipleship section layout** in `dashboard-metrics.tsx`:
- **Engagement Venn Diagram** — top-level 3-circle overlap: activity attendance, small groups, serving/leading
- **Know God** — attendance cards, baptisms, membership count (net of Milestone 48 registrations - Milestone 49 drops), unique event participants
- **Feed Your Soul** — small group trends, roster vs attendance comparison
- **Grow in Love** — serving/leading trends by month, breakdowns by role type and ministry
- **Change Your World** — giving by program, giving trends

**New DTO interfaces** in `src/lib/dto/dashboard.ts`:
- `ServingTrend`, `ServingByRoleType`, `ServingByMinistry`, `GivingByProgram`, `GivingTrend`, `EngagementOverlap`, `RosterVsAttendance`
- Extended `DashboardData` with all new fields

**New service methods** in `src/services/dashboardService.ts` (~710 lines added):
- `getMembershipCount()` — queries Participant_Milestones (Milestone 48 vs 49)
- `getUniqueEventParticipants()` — Events → Event_Participants with deduplication
- `getRosterVsAttendance()` — Group_Participants roster vs attendance records by group type
- `getServingTrends()`, `getServingByRoleType()`, `getServingByMinistry()`, `getTotalServingLeading()` — serving/leading queries
- `getGivingByProgram()`, `getGivingTrends()` — Donation_Distributions queries
- `getEngagementOverlap()` — 3-way set intersection across activity, groups, serving
- All queries run in parallel via `Promise.all`

**New components**:
- `src/components/dashboard/venn-diagram.tsx` — placeholder venn diagram
- `src/components/dashboard/serving-charts.tsx` — `ServingTrendsChart`, `ServingByRoleTypeChart`, `ServingByMinistryChart`
- `src/components/dashboard/giving-charts.tsx` — `ProgramGivingChart`, `GivingTrendsChart`
- `src/components/dashboard/roster-vs-attendance.tsx` — `RosterVsAttendanceChart`
- `src/components/dashboard/section-wrapper.tsx` — `SectionWrapper` for themed sections
- Updated `src/components/dashboard/index.ts` barrel exports

### Files Created
- `src/components/dashboard/giving-charts.tsx`
- `src/components/dashboard/roster-vs-attendance.tsx`
- `src/components/dashboard/section-wrapper.tsx`
- `src/components/dashboard/serving-charts.tsx`
- `src/components/dashboard/venn-diagram.tsx`

### Files Modified
- `src/components/dashboard/dashboard-metrics.tsx` — restructured into themed sections
- `src/components/dashboard/dashboard-shell.tsx` — minor import adjustment
- `src/components/dashboard/filter-dashboard-data.ts` — added new fields to filter
- `src/components/dashboard/index.ts` — new barrel exports
- `src/lib/dto/dashboard.ts` — 7 new interfaces, 11 new DashboardData fields
- `src/services/dashboardService.ts` — ~710 lines of new service methods

---

## Fix: Remove Giving Charts, Fix Column Name Bug, Fix Stack Overflow (`cf1159c`)

### Task
Post-launch bug fixes after the initial dashboard redesign.

### Changes Made

1. **Removed giving charts and "Change Your World" section** — Donation_Distributions queries were too slow and giving data was not requested by staff. Deleted `giving-charts.tsx`, removed `GivingByProgram`/`GivingTrend` imports, set `givingByProgram`/`givingTrends` to empty arrays
2. **Fixed Group_Role_Types column name bug** — `Role_Type` → `Group_Role_Type` (correct column name in MP schema)
3. **Fixed potential stack overflow** — `results.push(...batch)` can overflow the stack with large arrays; replaced with `for (const item of batch) results.push(item)` in `batchGetTableRecords`
4. **Scoped heavy queries to 12 months** — engagement overlap and snapshot metrics (roster, serving by role/ministry) now use `snapshotStart`/`snapshotEnd` (last 12 months) instead of the full 5-year ministry year range

### Files Modified
- `src/services/dashboardService.ts` — column fix, stack overflow fix, snapshot date range, removed giving methods (~150 lines deleted)
- `src/components/dashboard/dashboard-metrics.tsx` — removed "Change Your World" section
- `src/components/dashboard/giving-charts.tsx` — **deleted**
- `src/components/dashboard/index.ts` — removed giving barrel export
- `src/components/dashboard/filter-dashboard-data.ts` — minor adjustment

---

## Fix: Count Unique Individuals in Community Attendance Trends (`d14526d`)

### Task
Bug fix: `getCommunityAttendanceTrends` was using `Event_Participant_ID` (the record primary key) for deduplication instead of `Participant_ID` (the person identifier). This overcounted individuals who attended multiple events in the same period.

### Changes Made
- Changed deduplication key from `Event_Participant_ID` to `Participant_ID` in `getCommunityAttendanceTrends`

### Files Modified
- `src/services/dashboardService.ts` — 4 lines changed

---

## Revert: Restore Event_Participant_ID for Community Attendance Counting (`2d7f153`)

### Task
Reverted the previous fix after realizing the original logic was correct. Community attendance uses `Event_Participant_ID` correctly — each record represents one person at one event, and we want **headcount per week** (not unique individuals across weeks) for average weekly attendance calculations.

### Changes Made
- Reverted `Participant_ID` back to `Event_Participant_ID` in `getCommunityAttendanceTrends`

### Files Modified
- `src/services/dashboardService.ts` — 4 lines changed

---

## Feat: Progressive Loading for Heavy Dashboard Sections (`f3dffe8`)

### Task
Split data fetching into two phases so the page renders fast core metrics immediately while heavy queries (engagement overlap, serving, roster vs attendance) stream in after.

### Changes Made

**Service** (`src/services/dashboardService.ts`):
- `getDashboardData()` no longer fetches extended metrics — returns defaults (`0`, `[]`, empty `engagementOverlap`) for extended fields
- New `getExtendedDashboardData()` public method: fetches `uniqueEventParticipants`, `rosterVsAttendance`, `servingTrends`, `servingByRoleType`, `servingByMinistry`, `totalServingLeading`, `engagementOverlap` — all in parallel via `Promise.all`
- Snapshot metrics use last 12 months; time-series (servingTrends) uses current ministry year

**Actions** (`src/components/dashboard/actions.ts`):
- New `getCachedExtendedData(dateIso)` — `'use cache'` with `dashboard-extended` tag, 6h TTL
- New `getExtendedDashboardMetrics()` exported server action

**Shell** (`src/components/dashboard/dashboard-shell.tsx`):
- Added `extendedLoading` state (starts `true`)
- `useEffect` hook calls `getExtendedDashboardMetrics()` after initial render, merges result into `fullData`
- Refresh handler now fetches both core + extended in parallel

**Metrics** (`src/components/dashboard/dashboard-metrics.tsx`):
- Added `extendedLoading` prop
- Sections depending on extended data (venn, serving, roster, EP) show loading skeletons until `extendedLoading` is false
- Initial page load reduced from ~60s (all queries blocking) to core query time only

### Files Modified
- `src/services/dashboardService.ts` — split into core + extended methods
- `src/components/dashboard/actions.ts` — added extended cache + server action
- `src/components/dashboard/dashboard-shell.tsx` — progressive loading with useEffect
- `src/components/dashboard/dashboard-metrics.tsx` — extendedLoading prop + skeletons

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
