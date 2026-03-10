'use server';

import { requireFeatureAccess } from '@/lib/authorization';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ContactSearch } from '@/lib/dto';
import { searchByNameFlat } from '@/lib/processing-utils';
import { getCachedAllContacts } from './cached-contacts';

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
