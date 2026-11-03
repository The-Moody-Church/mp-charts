# Caching & PPR

The project uses **Cache Components** (`cacheComponents: true`) with **Partial Prerendering (PPR)**. All authenticated pages render as static HTML shell + streamed dynamic content via Suspense boundaries.

## Custom Cache Handler

**IMPORTANT**: In production, the default Next.js in-memory cache handler drops an entry once it is past `revalidate` (6h) and returns `undefined` — a full cache miss — instead of serving stale data. This caused 30+ second cold cache fetches every 6 hours.

A custom handler at `cache-handler.js` (configured via `cacheHandlers.default` in `next.config.ts`) fixes this: past `revalidate` it still returns the entry, with `revalidate: -1`, which tells the framework to serve it instantly while revalidating in the background.

**There is no hard expiry (#253).** Our `cacheLife({ revalidate, stale })` calls pass no `expire`, so Next fills in the default profile's, `INFINITE_CACHE` (verified in Next 16.4.2). The handler's expire check therefore never fires: an entry ends only on LRU eviction, tag expiry or a container restart. An older version of this file said "expire = revalidate + stale = 30h"; that was never true. **`stale` is not a server-side window at all** — it is how long the client router may reuse the value without asking the server. If a hard ceiling is ever wanted, pass `expire` explicitly (e.g. `expire: 108000` for 30h); the handler honours it.

**CRITICAL — `get()` must check `memoryCache` before `pendingSets`.** When the framework triggers a background revalidation, it calls `set(key, pendingEntry)` which adds the key to `pendingSets` for the full duration of the data fetch (20-40 seconds). If `get()` awaits `pendingSets` first, ALL requests during revalidation are blocked — completely defeating stale-while-revalidate. The handler checks `memoryCache` first and returns stale data immediately; it only awaits `pendingSets` when there is no cached data at all (e.g., initial cache warm).

**Note**: The cache is still in-memory (LRU, 50MB). Container restarts wipe the cache — cache warming on startup (`instrumentation.ts`) repopulates it within ~60s. The custom handler ensures stale-while-revalidate works correctly *within* a container's lifetime.

## Service-Layer Cache (Safety Net)

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
- Invalidate with `updateTag('my-tag')` from server actions. It **expires the tag immediately**: the next read of a tagged entry is a miss and regenerates in the foreground, and the caller waits for it. It is **not** stale-while-revalidate. That behaviour is `revalidateTag('my-tag', 'max')`, which marks the tag stale: the old value is served once more while it regenerates in the background (and, unlike `updateTag`, it also works in route handlers)
- **A refresh action must purge `serviceCache` before `updateTag`** (`serviceCache.deleteByPrefix(...)`). `updateTag` only makes the `'use cache'` function run again, and its `getOrFetch` then returns its own cached value, so nothing changes. `refreshDashboardCache` (`src/components/dashboard/actions.ts`) is the reference; `refreshMemberCache` lacked the purge until 2026-11-03, so the Manage Members Refresh button reloaded the same contacts for up to 6h. With the purge, the regeneration really does hit MP, so a refresh takes as long as a cold fetch
- **NEVER use `revalidatePath()` alongside `updateTag()`** — `revalidatePath` hard-purges the page's PPR shell, forcing a full re-render (10+ seconds). `updateTag` alone is sufficient for data invalidation.

**Current cached functions:**
| Function | Revalidate | Stale (client router) | Tags | File |
|---|---|---|---|---|
| `getCachedDashboardData(year)` | 6h | 24h | `dashboard-data`, `year-N` | `src/components/dashboard/cached-data.ts` |
| `getCachedFullRangeData(year, endDate)` | 6h | 24h | `dashboard-data`, `dashboard-full-range` | `src/components/dashboard/cached-data.ts` |
| `getCachedExtendedData(start, end)` | 6h | 24h | `dashboard-data`, `dashboard-extended` | `src/components/dashboard/cached-data.ts` |
| `getCachedEngagementData(start, end)` | 6h | 24h | `dashboard-data`, `dashboard-engagement` | `src/components/dashboard/cached-data.ts` |
| `getCachedGroupTypes(ids)` | 24h | 48h | `group-types` | `src/services/dashboardService.ts` |
| `getCachedAllContacts()` | 6h | 24h | `contacts-search` | `src/components/contact-lookup/cached-contacts.ts` |

All cached functions use **stale-while-revalidate**: after the revalidate TTL passes, the old value is still served instantly while fresh data is computed in the background, at both layers (the custom handler, and `serviceCache` inside the function). This prevents users from ever hitting a cold cache during normal operation. The exception is an explicit refresh (`updateTag` plus a `serviceCache` purge), which regenerates in the foreground by design.

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
2. Wrap the data fetch with `serviceCache.getOrFetch()` from `@/lib/service-cache` (see "Service-Layer Cache" section above)
3. Register it in `src/lib/cache-warming.ts` -> `warmAllCaches()` with the correct parameters
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
