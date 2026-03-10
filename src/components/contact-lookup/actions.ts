'use server';

import { cacheLife, cacheTag } from 'next/cache';
import { requireFeatureAccess } from '@/lib/authorization';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ContactService } from '@/services/contactService';
import { ContactSearch } from '@/lib/dto';
import { searchByNameFlat } from '@/lib/processing-utils';

/** Cached dataset of all contacts for search (6-hour TTL, stale-while-revalidate). */
async function getCachedAllContacts(): Promise<ContactSearch[]> {
  'use cache';
  cacheLife({ revalidate: 21600 }); // 6 hours
  cacheTag('contacts-search');

  const contactService = await ContactService.getInstance();
  return contactService.getAllContactsForSearch();
}

export async function searchContacts(searchTerm: string): Promise<ContactSearch[]> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "search");

    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }

    const allContacts = await getCachedAllContacts();
    const results = searchByNameFlat(allContacts, searchTerm.trim());

    return results.slice(0, 20);
  } catch (error) {
    console.error('Error searching contacts:', error);
    throw new Error('Failed to search contacts');
  }
}
