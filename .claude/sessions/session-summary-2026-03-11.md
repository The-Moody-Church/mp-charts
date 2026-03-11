# Session Summary — 2026-03-11

## Objectives
- Implement cache warming on container start (#80)
- Ensure all `'use cache'` functions are pre-warmed automatically
- Document the pattern so future cached functions are also registered

## Work Done

### Cache Warming Implementation (#80)

**Problem**: When the Docker container starts, all caches are cold. The first user to hit the dashboard or contact lookup waits for the full data fetch (multiple MP API calls, some taking 10+ seconds for engagement data).

**Solution**: Automatic cache warming via Next.js instrumentation hook + internal API endpoint.

**Architecture**:
1. `src/instrumentation.ts` — `register()` fires on server start, polls the warming endpoint until the server is ready (up to 10 retries, 2s apart)
2. `src/app/api/cache-warm/route.ts` — GET endpoint protected by `CACHE_WARM_SECRET` env var, calls `warmAllCaches()`
3. `src/lib/cache-warming.ts` — Central registry that calls every `'use cache'` function with computed parameters. All 5 cached functions run in parallel.

**Files created**:
- `src/components/dashboard/cached-data.ts` — Extracted 4 dashboard `'use cache'` functions from `actions.ts` (needed because `actions.ts` has `'use server'` which would make exports into server actions)
- `src/lib/cache-warming.ts` — Central warming orchestrator with `warmAllCaches()`
- `src/app/api/cache-warm/route.ts` — API endpoint for triggering warming
- `src/instrumentation.ts` — Next.js hook for automatic warming on server start

**Files modified**:
- `src/components/dashboard/actions.ts` — Now imports cached functions from `cached-data.ts` instead of defining them inline
- `CLAUDE.md` — Added "Cache Warming" section with mandatory steps for registering new cached functions, updated cached functions table with correct file paths

**Cached functions warmed** (all 6):
| Function | Source | TTL |
|---|---|---|
| `getCachedDashboardData` | `cached-data.ts` | 6h |
| `getCachedFullRangeData` | `cached-data.ts` | 6h |
| `getCachedExtendedData` | `cached-data.ts` | 6h |
| `getCachedEngagementData` | `cached-data.ts` | 6h |
| `getCachedGroupTypes` | `dashboardService.ts` | 24h (warmed indirectly via dashboard data) |
| `getCachedAllContacts` | `cached-contacts.ts` | 6h |

**Environment variable required**: `CACHE_WARM_SECRET` — any random string. Without it, warming is skipped silently.

**Key decisions**:
- Extracted cached functions to a separate non-`'use server'` file so they can be imported by both `actions.ts` and the warming module
- Used `instrumentation.ts` polling instead of a Docker entrypoint script — cleaner, no Dockerfile changes needed
- All caches warm in parallel for fastest startup
- Secret-based auth on the API endpoint (proxy already allows `/api/*` through)
