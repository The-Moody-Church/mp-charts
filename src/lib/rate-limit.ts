/**
 * In-memory sliding window rate limiter for server actions.
 *
 * Designed for single-instance deployment (Docker container).
 * Uses a Map of timestamp arrays per key, with automatic cleanup
 * of stale entries to prevent memory leaks.
 *
 * Usage:
 *   - General rate limit is enforced automatically by requireSession()
 *   - For stricter limits on writes/uploads, call checkRateLimit() explicitly
 */

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
}

/**
 * Rate limit tiers — applied per authenticated user.
 *
 * NOTE (F16): the `general` tier is enforced on EVERY server action via
 * requireSession() (which requireFeatureAccess() also calls), so it acts as the
 * universal per-user throughput gate — total server-action calls per user are
 * bounded by `general` (120/min). The `write`/`upload`/`search` tiers are stricter
 * *sub-caps* on those operation classes; they are NOT additional budget stacked on
 * top of `general` (a write action consumes one `general` unit AND one `write`
 * unit). Any future endpoint that bypasses requireSession (e.g. a new
 * unauthenticated route) must add its own limiter, ideally IP-keyed.
 */
export const RATE_LIMITS = {
  /** General server action calls (reads, navigation) — 120 per minute */
  general: { limit: 120, windowMs: 60_000 },
  /** Write operations (create, update, delete) — 30 per minute */
  write: { limit: 30, windowMs: 60_000 },
  /** File uploads — 10 per 10 minutes */
  upload: { limit: 10, windowMs: 600_000 },
  /** Search/lookup (PII access) — 30 per minute */
  search: { limit: 30, windowMs: 60_000 },
  /** Dashboard cache refresh — 5 per hour */
  cacheRefresh: { limit: 5, windowMs: 3_600_000 },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitTier = keyof typeof RATE_LIMITS;

/** Stores timestamps of recent requests: Map<"userId:tier", timestamp[]> */
const requestLog = new Map<string, number[]>();

/** Interval handle for cleanup — initialized lazily */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/** Start periodic cleanup of expired entries (every 5 minutes) */
function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    // Find the longest window across all tiers
    const maxWindow = Math.max(...Object.values(RATE_LIMITS).map(c => c.windowMs));
    for (const [key, timestamps] of requestLog) {
      // Remove timestamps older than the longest window
      const valid = timestamps.filter(t => now - t < maxWindow);
      if (valid.length === 0) {
        requestLog.delete(key);
      } else {
        requestLog.set(key, valid);
      }
    }
  }, 300_000); // Every 5 minutes

  // Don't prevent Node.js from exiting
  if (cleanupInterval && typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/**
 * Check whether a request is within rate limits.
 *
 * @param userId - The authenticated user's ID (from session.user.id)
 * @param tier - The rate limit tier to check against
 * @returns { allowed: true } or { allowed: false, retryAfterMs }
 */
export function checkRateLimit(
  userId: string,
  tier: RateLimitTier
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  // Fail closed on a blank identity (2026-05-21 audit, finding #19): without
  // this, every caller lacking a user id would share a single ":tier" bucket,
  // letting one anonymous source exhaust it — or slip through it — for all.
  if (!userId || !userId.trim()) {
    return { allowed: false, retryAfterMs: RATE_LIMITS[tier].windowMs };
  }

  ensureCleanup();

  const config = RATE_LIMITS[tier];
  const key = `${userId}:${tier}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Get existing timestamps and filter to current window
  const timestamps = (requestLog.get(key) || []).filter(t => t > windowStart);

  if (timestamps.length >= config.limit) {
    // Rate limited — calculate when the oldest request in the window expires
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  // Allow and record
  timestamps.push(now);
  requestLog.set(key, timestamps);
  return { allowed: true };
}

/**
 * Enforce a rate limit, throwing an error if exceeded.
 * Use this in server actions for write/upload/search operations.
 *
 * @throws Error with message "Rate limit exceeded. Try again in N seconds."
 */
export function enforceRateLimit(userId: string, tier: RateLimitTier): void {
  const result = checkRateLimit(userId, tier);
  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    throw new Error(`Rate limit exceeded. Try again in ${seconds} seconds.`);
  }
}

/**
 * Reset rate limit state for testing purposes only.
 * @internal
 */
export function _resetForTesting(): void {
  requestLog.clear();
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
