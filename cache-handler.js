/**
 * Custom cache handler that properly supports stale-while-revalidate.
 *
 * The default Next.js in-memory handler expires entries at `revalidate` time
 * (6h in our case), completely ignoring the `stale` parameter. After 6 hours,
 * the cache returns undefined — a full miss — causing 30+ second cold fetches.
 *
 * This handler uses `expire` (revalidate + stale = 30h) as the true expiry.
 * Between revalidate (6h) and expire (30h), it returns the cached entry with
 * revalidate: -1, which tells the framework to serve stale data instantly
 * while revalidating in the background.
 *
 * Configured via next.config.ts → cacheHandlers.default
 */

const { LRUCache } = require('next/dist/server/lib/lru-cache');
const {
  tagsManifest,
  areTagsExpired,
  areTagsStale,
} = require('next/dist/server/lib/incremental-cache/tags-manifest.external');

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB (same as Next.js default)

const memoryCache = new LRUCache(MAX_SIZE, (entry) => entry.size);
const pendingSets = new Map();
const debug = process.env.NEXT_PRIVATE_DEBUG_CACHE
  ? console.debug.bind(console, 'SWRCacheHandler:')
  : undefined;

/** @type {import('next/dist/server/lib/cache-handlers/types').CacheHandler} */
module.exports = {
  async get(cacheKey) {
    const pendingPromise = pendingSets.get(cacheKey);
    if (pendingPromise) {
      debug?.('get', cacheKey, 'pending');
      await pendingPromise;
    }

    const privateEntry = memoryCache.get(cacheKey);
    if (!privateEntry) {
      debug?.('get', cacheKey, 'not found');
      return undefined;
    }

    const entry = privateEntry.entry;
    const now = performance.timeOrigin + performance.now();

    // Truly expired: past revalidate + stale window — no data to serve
    if (now > entry.timestamp + entry.expire * 1000) {
      debug?.('get', cacheKey, 'expired (past expire window)');
      return undefined;
    }

    let revalidate = entry.revalidate;

    if (areTagsExpired(entry.tags, entry.timestamp)) {
      debug?.('get', cacheKey, 'had expired tag');
      return undefined;
    }

    if (areTagsStale(entry.tags, entry.timestamp)) {
      debug?.('get', cacheKey, 'had stale tag');
      revalidate = -1;
    }

    // Past revalidate time but within expire window → stale-while-revalidate
    // Return the cached data (served instantly) with revalidate: -1 to signal
    // the framework should revalidate in the background.
    if (now > entry.timestamp + entry.revalidate * 1000) {
      debug?.('get', cacheKey, 'stale (serving stale-while-revalidate)');
      revalidate = -1;
    }

    const [returnStream, newSaved] = entry.value.tee();
    entry.value = newSaved;

    debug?.('get', cacheKey, 'found', {
      tags: entry.tags,
      timestamp: entry.timestamp,
      expire: entry.expire,
      revalidate,
    });

    return {
      ...entry,
      revalidate,
      value: returnStream,
    };
  },

  async set(cacheKey, pendingEntry) {
    debug?.('set', cacheKey, 'start');
    let resolvePending = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolvePending = resolve;
    });
    pendingSets.set(cacheKey, pendingPromise);
    const entry = await pendingEntry;
    let size = 0;
    try {
      const [value, clonedValue] = entry.value.tee();
      entry.value = value;
      const reader = clonedValue.getReader();
      for (let chunk; !(chunk = await reader.read()).done; ) {
        size += Buffer.from(chunk.value).byteLength;
      }
      memoryCache.set(cacheKey, {
        entry,
        isErrored: false,
        errorRetryCount: 0,
        size,
      });
      debug?.('set', cacheKey, 'done');
    } catch (err) {
      debug?.('set', cacheKey, 'failed', err);
    } finally {
      resolvePending();
      pendingSets.delete(cacheKey);
    }
  },

  async refreshTags() {
    // Nothing to do for in-memory cache
  },

  async getExpiration(tags) {
    const expirations = tags.map((tag) => {
      const entry = tagsManifest.get(tag);
      if (!entry) return 0;
      return entry.expired || 0;
    });
    const expiration = Math.max(...expirations, 0);
    debug?.('getExpiration', { tags, expiration });
    return expiration;
  },

  async updateTags(tags, durations) {
    const now = Math.round(performance.timeOrigin + performance.now());
    debug?.('updateTags', { tags, timestamp: now });
    for (const tag of tags) {
      const existingEntry = tagsManifest.get(tag) || {};
      if (durations) {
        const updates = { ...existingEntry };
        updates.stale = now;
        if (durations.expire !== undefined) {
          updates.expired = now + durations.expire * 1000;
        }
        tagsManifest.set(tag, updates);
      } else {
        tagsManifest.set(tag, {
          ...existingEntry,
          expired: now,
        });
      }
    }
  },
};
