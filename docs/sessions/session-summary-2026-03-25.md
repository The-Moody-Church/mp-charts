# Session Summary — 2026-03-25

## Objectives

- Investigate ongoing cache issues (#132, #133) — users still seeing 20-30s cold cache loads
- Check if Ironside container is running the latest image

## Key Findings

### Root Cause: Default cache handler ignores `stale` parameter

The default Next.js `'use cache'` handler (`next/dist/server/lib/cache-handlers/default.js`) is an in-memory LRU cache that **deliberately ignores the `stale` parameter** in `cacheLife()`. From the source comments:

> "In-memory caches are fragile and should not use stale-while-revalidate semantics... stale entries should be considered expired/missing."

The handler expires entries at `revalidate` (6h) instead of `revalidate + stale` (30h). After 6 hours, it returns `undefined` — a full cache miss — causing synchronous 30+ second data fetches instead of serving stale data while revalidating in background.

### Container Status

- Container running since 2026-03-23 23:29 CDT (36h uptime)
- Running an older `:latest` image (pre-PR #131), but cache code hasn't changed since PR #128
- Cache warming logs show all 5 caches warm successfully at startup and daily 6 AM CT
- No `.next/cache/` directory exists — all caching is in-memory only

### Timeline of Issue #133

- 6 AM March 24: daily cache warm (all 5 succeeded)
- 12 PM March 24: cache entries expired (6h revalidate)
- 9:35 PM March 24: user hit dashboard — 30+ second cold miss (9.5h after expiry)

## Changes Made

### New: `cache-handler.js` (custom cache handler)

Created a custom cache handler that properly supports stale-while-revalidate:
- Uses `entry.expire` (30h) for true expiry instead of `entry.revalidate` (6h)
- Between 6h and 30h: returns cached data with `revalidate: -1` (signals background revalidation)
- Same in-memory LRU (50MB) as default — only the expiry logic changes
- Configured via `cacheHandlers.default` in `next.config.ts`

### Modified: `next.config.ts`

Added `cacheHandlers.default: require.resolve('./cache-handler.js')` to override the default handler.

### Modified: `CLAUDE.md`

Added "Custom Cache Handler" section under Caching & PPR documenting the issue and fix.

### Modified: `docs/status.md`, session summary

Updated with this session's work.

## Issues Addressed

- #132 — 20+ second contact search load (same root cause)
- #133 — No cold cache / 30+ second dashboard load

## Files Changed

- **Created**: `cache-handler.js`
- **Modified**: `next.config.ts`, `CLAUDE.md`, `docs/status.md`
- **Created**: `docs/sessions/session-summary-2026-03-25.md`

## Status: ⚠️ IN PROGRESS — awaiting branch/PR/deploy
