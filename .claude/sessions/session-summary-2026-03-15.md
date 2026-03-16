# Session Summary — 2026-03-15

## Objectives

Diagnose and fix intermittent production issue where Avg In-Person Attendance and Avg Online Attendance displayed as 0 on the Journey of a Lifetime dashboard.

## Issue Diagnosed

**Symptom**: Attendance metric cards in "Know God" section showed 0, while Baptisms and Engagement Overview venn diagram displayed correctly. Issue occurred intermittently, primarily late at night, on both desktop and mobile.

**Root Cause**: `getMonthlyAttendanceTrends` in `dashboardService.ts` fired ~55 parallel API calls (one per month over the 5-year full range) with no concurrency control. This overwhelmed the Ministry Platform API, causing `ConnectTimeoutError` (10s timeout to `moody.ministryplatform.com:443`). The error chain:

1. Too many concurrent connections → TCP connect timeout
2. Token refresh failed → `TypeError: fetch failed`
3. Any single month failure rejected the entire `Promise.all`
4. The `catch` block silently returned `[]`
5. Empty array cached for 6 hours via `'use cache'`, overwriting valid stale data
6. Client-side `computePeriodMetrics` computed 0s from empty `monthlyAttendanceTrends`

**Why late at night**: At midnight UTC (6 PM Central), the `endDateIso` cache key changes daily. The first request with the new key triggers a full re-computation. Daily cache warming at 6 AM Central leaves a 12-hour gap where the new key is unwarmed.

## Work Completed

### Concurrency Control Fix (`dashboardService.ts`)

- **Added `mapWithConcurrency` utility** — generic concurrency limiter that runs async tasks with a configurable pool size, returning `PromiseSettledResult[]`
- **Replaced `Promise.all` with `mapWithConcurrency(months, 6, ...)`** — limits to 6 concurrent MP API connections instead of 55+
- **Changed to `Promise.allSettled` pattern** — individual month failures no longer wipe all data; successful months are kept
- **Throws when ALL months fail** — prevents caching empty data over previously valid stale-while-revalidate data
- **Added per-month error logging** — failed months logged individually with a summary warning

### Production Immediate Fix

- Restarted `mpcharts-mp-charts-1` container to trigger fresh cache warming (5/5 caches warmed successfully)

## Files Modified

- `src/services/dashboardService.ts` — added `mapWithConcurrency`, rewrote `getMonthlyAttendanceTrends`

## Key Decisions

- Concurrency limit of 6 chosen as balance between speed and API stability (cache warm time: ~43s, comparable to prior ~49s)
- Used `Promise.allSettled` pattern rather than making the entire function re-throw on first error — partial data is better than no data
- Total failure (all months fail) still throws to prevent caching empty results — this preserves stale-while-revalidate behavior in Next.js `'use cache'`

## Testing

- All 236 unit tests pass
- Dev server cache warming: 5/5 succeeded, 0 failed, no `ConnectTimeoutError`
- Dashboard Refresh button: all POST /dashboard 200, no attendance errors
- Manual verification: all date filter presets, single month view, compare toggle confirmed working
