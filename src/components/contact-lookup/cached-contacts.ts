import { cacheLife, cacheTag } from 'next/cache';
import { ContactService } from '@/services/contactService';
import { ContactSearch } from '@/lib/dto';
import { serviceCache, CACHE_TTL } from '@/lib/service-cache';

/**
 * Cached dataset of all contacts for search.
 * Revalidates every 6 hours; serves stale for up to 24 hours (stale-while-revalidate).
 *
 * Uses serviceCache as a safety net — guarantees instant responses even if
 * the 'use cache' framework blocks or misses. See src/lib/service-cache.ts.
 *
 * NOTE: If you add a new 'use cache' function here, you MUST also register it
 * in src/lib/cache-warming.ts so it is pre-warmed on container start.
 * See the "Cache Warming" section in CLAUDE.md.
 */
export async function getCachedAllContacts(): Promise<ContactSearch[]> {
  'use cache';
  cacheLife({ revalidate: 21600, stale: 86400 }); // 6h revalidate, 24h stale
  cacheTag('contacts-search');

  return serviceCache.getOrFetch('contacts-search', CACHE_TTL.STANDARD, async () => {
    const contactService = await ContactService.getInstance();
    return contactService.getAllContactsForSearch();
  });
}
