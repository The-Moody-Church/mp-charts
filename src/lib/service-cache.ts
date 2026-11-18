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

import { errorForLog } from '@/lib/log-safe';

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  /**
   * Set by markForRefresh(): the next getOrFetch() fetches in the foreground
   * instead of returning this value, but the value is kept until that fetch
   * succeeds, so a failed refresh never leaves the key empty.
   */
  refreshRequested?: boolean;
}

class ServiceCache {
  private store = new Map<string, CacheEntry>();
  private refreshing = new Set<string>();
  /** In-flight forced refreshes, so concurrent callers share one fetch per key. */
  private forced = new Map<string, Promise<unknown>>();
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
        .catch((error) => {
          // Keep old data on failure — never lose cached data. Log it: callers
          // already got the stale value, so this line is the only trace of the
          // failed refresh. Keys are fixed prefixes plus server-computed dates.
          console.warn('[service-cache] background refresh failed; keeping cached value:', key, errorForLog(error));
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
   * Ask for a foreground refresh of every entry whose key starts with `prefix`,
   * WITHOUT dropping the entries. Used by explicit Refresh actions instead of
   * deleteByPrefix(): the next getOrFetch() for such a key awaits the fetcher.
   * - success: the new value replaces the old one and is returned
   * - failure: the old value stays cached (no longer marked), and the call
   *   rejects, so the caller can say the refresh failed. The next request is
   *   served the old value instantly, as after a failed background refresh.
   */
  markForRefresh(prefix: string): void {
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) entry.refreshRequested = true;
    }
  }

  /**
   * Get cached data or fetch if not available.
   * - Cache hit: returns instantly (triggers background refresh if stale)
   * - Marked by markForRefresh(): awaits the fetcher; keeps the old value if it fails
   * - Cache miss: awaits fetcher, stores result, returns it
   */
  async getOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const entry = this.store.get(key);
    if (entry?.refreshRequested) return this.forceRefresh(key, entry, fetcher);

    const cached = this.get<T>(key, ttlMs, fetcher);
    if (cached !== undefined) return cached;

    // Cold miss — must await the fetch
    const data = await fetcher();
    this.set(key, data);
    return data;
  }

  private forceRefresh<T>(key: string, entry: CacheEntry, fetcher: () => Promise<T>): Promise<T> {
    const inFlight = this.forced.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const p = fetcher()
      .then((data) => {
        this.set(key, data);
        return data;
      }, (error: unknown) => {
        // Keep the last good value; stop forcing, so later requests get it instantly
        // (and the usual TTL background refresh) instead of failing again in the foreground.
        if (this.store.get(key) === entry) entry.refreshRequested = false;
        console.warn('[service-cache] forced refresh failed; keeping cached value:', key, errorForLog(error));
        throw error;
      })
      .finally(() => this.forced.delete(key));
    this.forced.set(key, p);
    return p;
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
