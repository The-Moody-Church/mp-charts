# Session Summary — 2026-03-30

## Objective

Investigate and fix persistent slow cache responses (20+ seconds) on first access after 6-hour revalidate window expires. Issue #144 reported slow dashboard and contact lookup at 4:27 AM despite PR #143's service-cache safety net being deployed.

## Investigation

### Findings

1. **Service-cache singleton broken by Turbopack chunk splitting**: `getOrFetch` appeared in **5 separate compiled chunks**. Each chunk got its own `ServiceCache` instance with its own `Map`. Cache warming populated instance A, but user requests hit instance B (empty) — completely bypassing the safety net.

2. **Verbose MP API logging in production**: The `MinistryPlatformClient` and `TableService` logged every query's parameters and every fetched record (including PII: names, emails, phones, GUIDs) to stdout. Generated **812K log lines in 24 hours**, making debugging nearly impossible and creating a PII exposure risk.

### Timeline at 4:25 AM CDT (from container logs)
- 09:25:36 UTC: First token refresh — user hits the site
- 09:25:37: Auth queries complete (dp_Users, roles, groups)
- 09:25:54: Contacts fetch begins from MP API (17-second gap = likely dashboard revalidation)
- 09:27:49: Contacts fetch still paginating (2+ minutes of MP API calls)

### Root Cause Confirmation
- `docker exec` confirmed `service-cache.ts` source not in container (multi-stage build strips source)
- `grep -rl "getOrFetch"` found it in 5 separate SSR chunks — proving duplicate singleton instances
- The 6 AM daily re-warm completed in 1.29s (same code path as initial warm → same instance with data)
- User requests at 4:27 AM hit a different chunk's empty instance → 20+ second MP fetch

## Changes

### PR (TBD)

| File | Change |
|------|--------|
| `src/lib/service-cache.ts` | Use `globalThis` for singleton — survives Turbopack chunk splitting |
| `src/lib/providers/ministry-platform/client.ts` | Remove verbose token logging (token validity, expiry, refresh) |
| `src/lib/providers/ministry-platform/services/table.service.ts` | Remove verbose query/record logging (PII exposure) |
| `src/lib/providers/ministry-platform/services/procedure.service.ts` | Remove verbose procedure param/result logging |

### Key Decision
Used `globalThis` pattern (standard Next.js recommendation for singletons like Prisma) rather than alternatives like process.env or file-based caching. This ensures all Turbopack chunks share one `ServiceCache` instance regardless of bundling.

## Refresh Button Fix (follow-up)

The "Refresh Data" button on the dashboard called `updateTag()` to mark the framework cache as stale, then re-fetched data. But the service-cache still returned old data instantly — so the user saw identical numbers and thought the refresh worked. Fixed by calling `serviceCache.deleteByPrefix('dashboard')` and `serviceCache.deleteByPrefix('group-types')` before `updateTag()`. Now the re-fetch hits a cold service-cache miss and actually queries the MP API. The existing `startRefreshTransition` in `dashboard-shell.tsx` already dims the charts and spins the button during the fetch.

### Files Changed
| File | Change |
|------|--------|
| `src/lib/service-cache.ts` | Added `deleteByPrefix(prefix)` method |
| `src/components/dashboard/actions.ts` | Purge service-cache in `refreshDashboardCache()` before `updateTag()` |

## Status
- [x] Root cause identified: Turbopack chunk splitting creates duplicate singletons
- [x] Fix implemented: `globalThis` pattern for service-cache
- [x] Verbose logging removed (PII security fix)
- [x] Refresh button now purges service-cache so users get truly fresh data
- [x] Build passes
- [ ] Deploy and verify — first test after 6+ hours will confirm the singleton fix
