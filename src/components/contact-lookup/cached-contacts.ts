import { cacheLife, cacheTag } from 'next/cache';
import { ContactService } from '@/services/contactService';
import { ContactSearch } from '@/lib/dto';

/** Cached dataset of all contacts for search (6-hour TTL, stale-while-revalidate). */
export async function getCachedAllContacts(): Promise<ContactSearch[]> {
  'use cache';
  cacheLife({ revalidate: 21600 }); // 6 hours
  cacheTag('contacts-search');

  const contactService = await ContactService.getInstance();
  return contactService.getAllContactsForSearch();
}
