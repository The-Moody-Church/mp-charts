import { cacheLife, cacheTag } from 'next/cache';
import { ContactService } from '@/services/contactService';
import { ContactSearch } from '@/lib/dto';

/**
 * Cached dataset of all contacts for search.
 * Revalidates every 6 hours; serves stale for up to 24 hours (stale-while-revalidate).
 *
 * NOTE: If you add a new 'use cache' function here, you MUST also register it
 * in src/lib/cache-warming.ts so it is pre-warmed on container start.
 * See the "Cache Warming" section in CLAUDE.md.
 */
export async function getCachedAllContacts(): Promise<ContactSearch[]> {
  'use cache';
  cacheLife({ revalidate: 21600, stale: 86400 }); // 6h revalidate, 24h stale
  cacheTag('contacts-search');

  const contactService = await ContactService.getInstance();
  return contactService.getAllContactsForSearch();
}
