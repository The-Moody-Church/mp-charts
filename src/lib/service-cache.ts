/**
 * Service-layer in-memory cache with stale-while-revalidate semantics.
 *
 * Acts as a safety net independent of Next.js's 'use cache' framework.
 * Once data is cached here, it is ALWAYS returned instantly — even if stale.
 * Background refresh happens non-blocking when data exceeds its TTL.
 *
 * This guarantees sub-second responses regardless of what the 'use cache'
 * framework does (pendingSets blocking, LRU eviction, stream corruption, etc.).
 *
 * Populated during cache warming (instrumentation.ts → cache-warming.ts)
 * and during normal 'use cache' function execution.
 */

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

class ServiceCache {
  private store = new Map<string, CacheEntry>();
  private refreshing = new Set<string>();
  /**
   * Upper bound on distinct cache entries. The app's known cached functions use a
   * small, fixed set of keys, so this only ever trips if keys are derived from
   * unvalidated input — it bounds memory growth from that (F10). Eviction is FIFO
   * by insertion order (re-inserting on each set keeps recently-written keys last).
   */
  private static readonly MAX_ENTRIES = 500;

  /**
   * Get cached data if available. Returns undefined if key has never been set.
   * If data is past ttlMs, triggers a non-blocking background refresh via fetcher.
   */
  get<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // Stale? Refresh in background — never blocks the caller
    if (Date.now() - entry.timestamp > ttlMs && !this.refreshing.has(key)) {
      this.refreshing.add(key);
      fetcher()
        .then(data => {
          this.store.set(key, { data, timestamp: Date.now() });
        })
        .catch(() => {
          // Keep old data on failure — never lose cached data
        })
        .finally(() => this.refreshing.delete(key));
    }

    return entry.data as T;
  }

  /**
   * Store data with current timestamp.
   */
  set<T>(key: string, data: T): void {
    // Re-insert so the just-written key moves to the end (most-recent) — keeps the
    // FIFO eviction below from immediately dropping a freshly-set existing key.
    this.store.delete(key);
    this.store.set(key, { data, timestamp: Date.now() });

    // F10: bound total entries; evict the oldest (front of insertion order).
    if (this.store.size > ServiceCache.MAX_ENTRIES) {
      let toRemove = this.store.size - ServiceCache.MAX_ENTRIES;
      for (const k of this.store.keys()) {
        if (toRemove <= 0) break;
        this.store.delete(k);
        this.refreshing.delete(k);
        toRemove--;
      }
    }
  }

  /**
   * Delete all entries whose key starts with the given prefix.
   * Used by explicit refresh actions to force a cold fetch.
   */
  deleteByPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        this.refreshing.delete(key);
      }
    }
  }

  /**
   * Get cached data or fetch if not available.
   * - Cache hit: returns instantly (triggers background refresh if stale)
   * - Cache miss: awaits fetcher, stores result, returns it
   */
  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key, ttlMs, fetcher);
    if (cached !== undefined) return cached;

    // Cold miss — must await the fetch
    const data = await fetcher();
    this.set(key, data);
    return data;
  }
}

/**
 * Singleton instance shared across all services.
 *
 * Uses globalThis to survive Turbopack chunk splitting. Without this,
 * each chunk gets its own ServiceCache instance — cache warming populates
 * one instance, but user requests hit a different (empty) instance.
 */
const globalForCache = globalThis as unknown as { __serviceCache?: ServiceCache };
export const serviceCache = (globalForCache.__serviceCache ??= new ServiceCache());

/** Common TTL constants (milliseconds) */
export const CACHE_TTL = {
  /** 6 hours — matches dashboard/contacts 'use cache' revalidate */
  STANDARD: 6 * 60 * 60 * 1000,
  /** 24 hours — matches group types 'use cache' revalidate */
  LONG: 24 * 60 * 60 * 1000,
} as const;
