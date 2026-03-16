# Caching & PPR

The project uses **Cache Components** (`cacheComponents: true`) with **Partial Prerendering (PPR)**. All authenticated pages render as `◐ (Partial Prerender)` — the static HTML shell loads instantly, then dynamic content streams in via Suspense boundaries.

## `'use cache'` Directive

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

## Current Cached Functions

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

## Cache Warming

Caches are **pre-warmed automatically on server start** and **re-warmed daily at 6:00 AM Central Time** so users never hit a cold cache.

**How it works:**
1. `src/instrumentation.ts` — `register()` runs on server start, generates a random token on `process.env`, polls `/api/cache-warm` until the server is ready, then schedules daily re-warming at 6:00 AM CT via `setTimeout`/`setInterval`
2. `src/app/api/cache-warm/route.ts` — Verifies the runtime token, calls `warmAllCaches()` within the Next.js request context (required for `'use cache'` functions)
3. `src/lib/cache-warming.ts` — Central registry that calls every `'use cache'` function with the correct parameters

Cache warming runs automatically on every server start and daily at 6:00 AM CT — no configuration required. The endpoint is protected by a per-process random token shared via `process.env.__CACHE_WARM_TOKEN`.

**Adding a new cached function — MANDATORY steps:**
1. Create the `'use cache'` function in a non-`'use server'` file (so it can be imported by the warming module)
2. Register it in `src/lib/cache-warming.ts` → `warmAllCaches()` with the correct parameters
3. Update the "Current cached functions" table above
4. Add a comment at the top of the source file pointing to `cache-warming.ts`

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

## Suspense & PPR Pattern for Pages

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

## Layout Auth Pattern

The web layout wraps `AuthWrapper` (which uses `headers()`) in a Suspense boundary so the outer HTML shell pre-renders:

```typescript
<Suspense fallback={<Loading />}>
  <AuthWrapper>
    <Providers>{children}</Providers>
  </AuthWrapper>
</Suspense>
```
