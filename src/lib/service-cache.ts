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
    this.store.set(key, { data, timestamp: Date.now() });
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

/** Singleton instance shared across all services */
export const serviceCache = new ServiceCache();

/** Common TTL constants (milliseconds) */
export const CACHE_TTL = {
  /** 6 hours — matches dashboard/contacts 'use cache' revalidate */
  STANDARD: 6 * 60 * 60 * 1000,
  /** 24 hours — matches group types 'use cache' revalidate */
  LONG: 24 * 60 * 60 * 1000,
} as const;
