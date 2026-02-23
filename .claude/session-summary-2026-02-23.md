# Session Summary — 2026-02-23

## Investigation: `unstable_cache` → `use cache` Migration (Issue #21)

### Task
Investigated whether the `unstable_cache` → `'use cache'` migration is now feasible in Next.js 16 stable, following the revert in PR #10.

### Findings

**Migration is now possible.** Next.js 16 (stable since Oct 2025) ships `'use cache'` as a production-ready feature. The original revert was because `'use cache'` was canary-only at the time.

### Current `unstable_cache` Usage (4 call sites)

| File | Function | TTL | Tags |
|---|---|---|---|
| `src/components/dashboard/actions.ts:10` | `getCachedDashboardData()` | 6h (21600s) | `dashboard-data`, `year-${year}` |
| `src/components/dashboard/actions.ts:28` | `getCachedFullRangeData()` | 6h (21600s) | `dashboard-data`, `dashboard-full-range` |
| `src/services/dashboardService.ts:23` | `getCachedGroupTypes()` | 24h (86400s) | `group-types` |
| `src/services/dashboardService.ts:43` | `getCachedEventTypes()` | 24h (86400s) | `event-types` |

Also: `src/services/volunteerService.ts:122` has an in-memory `Map` cache (unrelated to `unstable_cache`).

### Two Migration Paths Identified

#### Option A: `experimental: { useCache: true }` (Recommended)
- Enables `'use cache'` directive without PPR or Suspense requirements
- Drop-in replacement for the 4 `unstable_cache` call sites
- Minimal diff — each call becomes `'use cache'` + `cacheLife()` + `cacheTag()`
- Still under `experimental` flag, but the directive itself is stable in Next.js 16

#### Option B: `cacheComponents: true` (Full Cache Components)
- Stable, non-experimental — recommended by Next.js team
- Enables PPR (Partial Prerendering) automatically
- Requires `<Suspense>` boundaries around ALL uncached dynamic data access
- More invasive — build errors until all components are properly wrapped
- Better long-term path (access to `'use cache: remote'`, PPR performance)

### Compatibility Confirmed
- `output: "standalone"` — works with both options
- Docker self-hosting — in-memory cache works for single-container deployment
- `revalidateTag()` — compatible with `'use cache'` tags
- Existing `{ expire: 0 }` pattern in `refreshDashboardCache()` is compatible

### Recommendation
Start with Option A for immediate migration (focused, low-risk). Upgrade to Option B when ready for a larger architectural change (e.g., dashboard redesign #42).

### Files Modified
- `.claude/ideas.md` — Updated issue #21 entry from "REVERTED" to "READY TO MIGRATE" with findings
- `.claude/session-summary-2026-02-23.md` — This file (created)

### Sources
- [Next.js 16 release blog](https://nextjs.org/blog/next-16)
- [Next.js `use cache` directive docs](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Next.js `cacheComponents` config](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents)
- [Next.js `useCache` experimental config](https://nextjs.org/docs/app/api-reference/config/next-config-js/useCache)
- [Next.js `cacheLife` function](https://nextjs.org/docs/app/api-reference/functions/cacheLife)
- [Next.js `cacheTag` function](https://nextjs.org/docs/app/api-reference/functions/cacheTag)
- [Next.js `unstable_cache` (deprecated)](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
