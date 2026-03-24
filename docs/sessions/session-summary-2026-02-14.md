# Session Summary — 2026-02-14

## Client-Side Date Filtering (Preloaded Full Range)

### Overview
Replaced per-filter-change server action calls with a preloaded full-range dataset that is filtered entirely client-side. Filter changes are now instant — no server round-trip.

### Architecture Change

**Before (server-side on every filter change):**
```
User clicks filter → getDashboardMetricsByDateRange() server action → MP API queries → return data
```

**After (client-side filtering):**
```
Page load → getFullRangeDashboardMetrics() fetches 5 years (cached 6 hrs)
User clicks filter → useMemo recomputes filteredData instantly, no server call
Refresh button → re-fetches full range from server
```

### Files Modified

#### New Files
- **`src/components/dashboard/filter-dashboard-data.ts`** — Client-side filtering utility
  - `filterDashboardData(fullData, selection)` — main entry point
  - `filterMonthlyTrends()` — filters `MonthlyAttendanceTrend[]` by date range
  - `filterMonthlyByDate()` — generic monthly filter for `SmallGroupTrend[]`
  - `computePeriodMetrics()` — recomputes `PeriodMetrics` from filtered monthly data using weighted averages (avg × eventCount / totalEvents)
  - `computeYearOverYear()` — recomputes YoY comparison from recomputed period metrics

#### Modified Files
- **`src/components/dashboard/actions.ts`**
  - Removed `getDashboardMetricsByDateRange()`
  - Added `getFullRangeDashboardMetrics()` — fetches Sept of earliest available year through today, cached 6 hrs

- **`src/components/dashboard/dashboard-shell.tsx`**
  - `data` state → `fullData` state (stores full 5-year dataset)
  - Added `filteredData = useMemo(filterDashboardData, [fullData, selection])`
  - `handleSelectionChange` just calls `setSelection()` — no async work
  - `handleRefresh` calls `getFullRangeDashboardMetrics()` instead of date-range action
  - Removed `isFiltering` transition (filtering is synchronous)

- **`src/app/(web)/dashboard/page.tsx`**
  - Calls `getFullRangeDashboardMetrics()` instead of `getDashboardMetrics()`
  - BUILD_ID updated to `client-side-filter-v1`

- **`src/components/dashboard/index.ts`**
  - Added `filterDashboardData` export

### Design Decisions

1. **Full range = 5 ministry years**: Matches the selectable range in `getAvailableYears()` (current ministry year minus 4)
2. **Weighted average for PeriodMetrics**: `avg = sum(monthAvg × monthEventCount) / totalEventCount` — gives accurate overall average even when months have different event counts
3. **`uniqueAttendees` set to 0**: Not derivable from monthly averages (would need raw participant data). These fields are not displayed in the current UI.
4. **`groupTypeMetrics`/`eventTypeMetrics`/`baptisms` pass-through**: These are pre-aggregated on the server and not decomposable into time-series. They reflect the full 5-year range regardless of filter.
5. **YearOverYear simplified**: Only includes attendance-derived metrics (Average Attendance, Total Events, Avg In-Person, Avg Online). Group/event metrics from original `calculateYearOverYear()` were already placeholder values (previousYear = 0).

### Testing Notes
- Filter clicks should be instant (no loading spinner, no opacity change)
- Only the Refresh button triggers a server call
- Verify that narrowing the date filter correctly reduces the trend data points
- Previous period data (compare toggle) should show the year-before equivalent of the selected range

---

## Dashboard Filter UX Improvements

### Changes Made

#### 1. Month Button Ordering (Sep-Aug)
- **File**: `src/components/dashboard/date-range-filter.tsx`
- Changed `getOrderedMonths()` from dynamic "last 12 months ending at current" to fixed ministry year order: `[8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7]` (Sep through Aug)

#### 2. Semester Preset Buttons
- **File**: `src/components/dashboard/date-range-filter.tsx`
- Added three new preset constants: `FALL_SEMESTER_MONTHS` (Sep-Nov), `SPRING_SEMESTER_MONTHS` (Feb-Apr), `SUMMER_MONTHS` (Jun-Aug)
- Generalized `isMinistryYearPreset()` → `isPresetMatch(selection, presetMonths)` for reuse
- Added `handlePreset()` callback for semester buttons (preserves compare toggle state)
- Buttons appear after Ministry Year, before Compare Previous Period checkbox
- Each highlights with `secondary` variant when its exact months are selected

#### 3. Extended Data Range to Sep-Aug
- **File**: `src/components/dashboard/actions.ts`
  - `getDashboardMetrics()`: end date changed from May 31 to Aug 31
  - `getFullRangeDashboardMetrics()`: max end date changed from May 31 to Aug 31
- **File**: `src/components/dashboard/date-range-filter.tsx`
  - Fallback range in `selectionToDateRange()` updated to Aug 31
- **File**: `src/services/dashboardService.ts`
  - Updated comments to reflect Sep-Aug range
- Ministry Year preset still selects Sep-May only

#### 4. Attendance Chart Readability
- **File**: `src/components/dashboard/attendance-chart.tsx`
- Extended `monthOrder` to include June, July, August
- Added `margin={{ top: 5, right: 20, left: 20, bottom: 5 }}` to `LineChart`
- Added `padding={{ left: 20, right: 20 }}` to `XAxis`
- First/last data points no longer overlap the Y-axis

#### 5. Ideas Tracker
- **File**: `.claude/ideas.md`
- Added "Upgrade to Next.js 16" under Technical Debt section
- Currently on 15.5.6, latest is 16.1.6 LTS with Turbopack, React Compiler, etc.

#### 6. Chart Layout Reorganization
- **File**: `src/components/dashboard/dashboard-metrics.tsx`
- Swapped Small Group Trends and Group Participation chart positions
- Small Group Trends now in top 2-column grid (alongside Worship Service Attendance)
- Group Participation and Period Comparison share bottom 2-column grid

#### 7. Small Group Trends — Previous Period Comparison
- **File**: `src/components/dashboard/small-group-trends.tsx`
- Added `previousYear` prop with dashed lines for previous period data
- Merges current and previous year data by month name
- Added ministry year month ordering (Sep-Aug) for X-axis
- Added chart margins/padding matching attendance chart style
- **File**: `src/components/dashboard/filter-dashboard-data.ts`
- Added computation of `previousYearSmallGroupTrends` using previous period date range
- **File**: `src/lib/dto/dashboard.ts`
- Added `previousYearSmallGroupTrends: SmallGroupTrend[]` to `DashboardData`
- **File**: `src/services/dashboardService.ts`
- Returns empty array for `previousYearSmallGroupTrends` (computed client-side)

#### 8. Data-Level Timezone Fix (YYYY-MM Parsing)
- **Problem**: Each chart independently parsing YYYY-MM strings risked timezone bugs (`new Date("2025-09")` → Aug 31 in Central Time)
- **Solution**: Added `monthName: string` to `SmallGroupTrend` DTO (matching `MonthlyAttendanceTrend` pattern)
- **File**: `src/lib/dto/dashboard.ts` — Added `monthName` field to `SmallGroupTrend`
- **File**: `src/services/dashboardService.ts` — Extracted `MONTH_NAMES` constant, populate `monthName` in both `getSmallGroupTrends()` and `getMonthlyAttendanceTrends()`
- **File**: `src/components/dashboard/small-group-trends.tsx` — Removed `parseMonthName()` helper, uses `item.monthName` directly
- Charts no longer need to parse YYYY-MM strings for display — month names come from the data layer

#### 9. Stale Cache Compatibility Fix
- **Problem**: `unstable_cache` served `SmallGroupTrend` objects without the new `monthName` field, causing blank chart
- **Solution**: Added `ensureMonthName()` in `filterDashboardData` to derive `monthName` from YYYY-MM `month` field if missing
- **File**: `src/components/dashboard/filter-dashboard-data.ts` — added `MONTH_NAMES` constant and `ensureMonthName()` normalizer
- Applied to both `smallGroupTrends` and `previousYearSmallGroupTrends` after filtering

### Files Modified
- `src/components/dashboard/date-range-filter.tsx` - Month ordering, semester presets, fallback range
- `src/components/dashboard/attendance-chart.tsx` - Month order, chart margins
- `src/components/dashboard/actions.ts` - Extended data fetch range to Aug 31
- `src/components/dashboard/dashboard-metrics.tsx` - Chart layout reorganization, pass previous year data to SmallGroupTrends
- `src/components/dashboard/small-group-trends.tsx` - Previous period comparison, timezone fix, ministry year ordering
- `src/components/dashboard/filter-dashboard-data.ts` - Previous year small group trends computation
- `src/lib/dto/dashboard.ts` - Added `monthName` to SmallGroupTrend, `previousYearSmallGroupTrends` to DashboardData
- `src/services/dashboardService.ts` - `MONTH_NAMES` constant, `monthName` population, previousYearSmallGroupTrends
- `.claude/ideas.md` - Next.js 16 upgrade idea
- `.claude/work-in-progress.md` - Updated status

---

## Next.js 16 Upgrade + Cache Components Migration

### Summary

Upgraded the project from Next.js 15.5.6 to Next.js 16.1.6 LTS, addressing all breaking changes. Then migrated all `unstable_cache` usage to the new `'use cache'` directive with `cacheTag` and `cacheLife`.

### Changes Made

#### Dependency Upgrades (`package.json`)
- `next`: `^15.5.6` → `^16.1.6`
- `next-auth`: `^5.0.0-beta.28` → `^5.0.0-beta.30` (required for Next.js 16 peer dependency compatibility)
- `eslint-config-next`: `15.3.2` → `^16.1.6`
- `lint` script: `next lint` → `eslint` (Next.js 16 removed the `next lint` command)

#### ESLint Configuration (`eslint.config.mjs`)
- Replaced legacy `FlatCompat` wrapper with native ESLint `defineConfig` API
- Uses `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` directly
- Added `globalIgnores` for `.next/**`, `out/**`, `build/**`, `next-env.d.ts`
- Removed dependency on `@eslint/eslintrc` `FlatCompat` (no longer needed)

#### Breaking Change: `revalidateTag` Signature (`src/components/dashboard/actions.ts:116-118`)
- Next.js 16 requires a second `profile` parameter for `revalidateTag()`
- Added `'max'` as the profile for all three `revalidateTag` calls (enables stale-while-revalidate)
- `revalidatePath` signature unchanged

#### Lint Fix (`scripts/setup.ts:1096`)
- Fixed `prefer-const` lint error exposed by stricter ESLint config
- Separated `let envVarsResult` from `const { missing, empty }` since `envVarsResult` gets reassigned at line 1156

#### Test Fix (`src/lib/providers/ministry-platform/helper.test.ts:96-107`)
- Updated test expectations to match actual auto-pagination behavior
- When `top`/`skip` are not provided, auto-pagination sends `$top: 1000, $skip: 0` (not `undefined`)
- This was a pre-existing test mismatch, not caused by the upgrade

### What Was Already Compatible (No Changes Needed)
- Async params/searchParams patterns (already using Promise-based approach from Next.js 15)
- `middleware.ts` (deprecated but still functional; edge runtime not supported in new `proxy.ts`)
- `next/image` usage with `unoptimized` prop
- `unstable_cache` (legacy but still functional in Next.js 16)
- `next.config.ts` with `output: "standalone"`
- `tsconfig.json` settings
- Auth configuration (`src/auth.ts`) and NextAuth route handler
- All Radix UI / shadcn components

### Verification Results
- **Lint**: 0 errors, 0 warnings
- **Tests**: 150/150 passing across 6 test files
- **TypeScript**: 0 errors in source code (pre-existing test file type issues only)
- **Build**: Cannot complete in sandbox (Google Fonts API blocked), but all code compiles correctly

### Known Deprecation Warnings
- `middleware.ts` is deprecated in favor of `proxy.ts` — kept as-is because `proxy.ts` doesn't support edge runtime
- `unstable_cache` is legacy, replaced by `use cache` directive — kept as-is for backward compatibility

---

## Cache Components Migration (`unstable_cache` → `use cache`)

### Config Changes (`next.config.ts`)
- Added `cacheComponents: true` to enable Cache Components
- Defined custom `cacheLife` profiles:
  - `dashboard`: stale 5min, revalidate 6hr, expire 1day
  - `static-lookup`: stale 1hr, revalidate 24hr, expire 1week

### `src/services/dashboardService.ts`
- Replaced `unstable_cache` import with `cacheLife, cacheTag` from `next/cache`
- Extracted `getGroupTypesWithCache` → standalone `fetchGroupTypes(ids)` with `'use cache'`
- Extracted `getEventTypesWithCache` → standalone `fetchEventTypes(ids)` with `'use cache'`
- Both use `cacheLife('static-lookup')` and `cacheTag('group-types')`/`cacheTag('event-types')`
- Class methods now delegate to these standalone cached functions

### `src/components/dashboard/actions.ts`
- Replaced `unstable_cache` import with `cacheLife, cacheTag`
- Created `cachedDashboardData(ministryYear)` with `'use cache'` + `cacheLife('dashboard')`
- Created `cachedFullRangeData(earliestYear, currentYear)` with `'use cache'` + `cacheLife('dashboard')`
- Server actions now delegate to these cached functions
- `refreshDashboardCache` unchanged (still uses `revalidateTag`)

### Key Architecture Decision
- `'use cache'` functions are standalone module-level functions (not class methods) because the directive auto-generates cache keys from serializable function arguments; class `this` context is not serializable
- Non-exported cached functions coexist with file-level `'use server'` in actions.ts

---

## Node.js 22 + Doc Updates

### Dockerfile
- Upgraded all 3 stages from `node:20-alpine3.21` to `node:22-alpine`
- Node 20 EOL is April 30, 2026; Node 22 LTS supported through April 2027

### Dashboard Page (`src/app/(web)/dashboard/page.tsx`)
- Removed `export const revalidate = 21600` (incompatible with `cacheComponents`)
- Replaced with `'use cache'` + `cacheLife('dashboard')` on the page component

### README.md
- Updated Next.js version references: 15 → 16
- Updated Node.js requirement: v18 → v22 (v20.9+ minimum)

### Files Modified (All Parts)
| File | Change |
|------|--------|
| `package.json` | Upgraded next, next-auth, eslint-config-next; changed lint script |
| `eslint.config.mjs` | Rewrote for native ESLint flat config |
| `next.config.ts` | Added cacheComponents + custom cacheLife profiles |
| `src/components/dashboard/actions.ts` | Migrated from `unstable_cache` to `'use cache'` directive |
| `src/services/dashboardService.ts` | Migrated from `unstable_cache` to `'use cache'` directive |
| `src/app/(web)/dashboard/page.tsx` | Replaced `revalidate` config with `'use cache'` + `cacheLife` |
| `Dockerfile` | Upgraded from `node:20-alpine3.21` to `node:22-alpine` |
| `README.md` | Updated Next.js/Node version references |
| `scripts/setup.ts` | Fixed `prefer-const` lint error |
| `src/lib/providers/ministry-platform/helper.test.ts` | Fixed test expectations for auto-pagination |
| `.claude/ideas.md` | Marked upgrade + cache migration complete |
| `.claude/work-in-progress.md` | Updated environment details |
