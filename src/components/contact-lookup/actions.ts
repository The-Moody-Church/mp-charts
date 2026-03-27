'use server';

import { requireFeatureAccess } from '@/lib/authorization';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ContactSearch } from '@/lib/dto';
import { scoreNameMatch } from '@/lib/processing-utils';
import { getCachedAllContacts } from './cached-contacts';

/**
 * Engagement level sort priority for tie-breaking.
 * Lower number = higher priority in search results.
 */
const ENGAGEMENT_PRIORITY: Record<number, number> = {
  2: 0, // Fully Engaged
  1: 1, // Partially Engaged
  5: 2, // Observing
  3: 3, // Lapsing
  4: 4, // Lapsed
};
const DEFAULT_ENGAGEMENT_PRIORITY = 5; // No engagement record — lowest priority

export async function searchContacts(
  searchTerm: string,
  activeOnly: boolean = true,
): Promise<ContactSearch[]> {
  try {
    const session = await requireFeatureAccess("contact-lookup");
    enforceRateLimit(session.user.id, "search");

    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }

    let contacts = await getCachedAllContacts();

    // Filter to active contacts only (Contact_Status_ID = 1) when requested
    if (activeOnly) {
      contacts = contacts.filter(c => c.Contact_Status_ID === 1);
    }

    const query = searchTerm.trim();

    // Score, filter, and sort with engagement level as tie-breaker
    const scored = contacts
      .map(item => ({
        item,
        score: scoreNameMatch(item, query),
        engagementPriority: ENGAGEMENT_PRIORITY[item.Participant_Engagement_ID ?? -1] ?? DEFAULT_ENGAGEMENT_PRIORITY,
      }))
      .filter(({ score }) => score > 0);

    scored.sort((a, b) => {
      // Primary: score descending
      if (b.score !== a.score) return b.score - a.score;
      // Secondary: engagement priority ascending (lower = better)
      if (a.engagementPriority !== b.engagementPriority) return a.engagementPriority - b.engagementPriority;
      // Tertiary: last name alphabetical
      const lastCmp = (a.item.Last_Name ?? "").localeCompare(b.item.Last_Name ?? "");
      if (lastCmp !== 0) return lastCmp;
      // Quaternary: first name alphabetical
      return (a.item.First_Name ?? "").localeCompare(b.item.First_Name ?? "");
    });

    return scored.map(({ item }) => item);
  } catch (error) {
    console.error('Error searching contacts:', error);
    throw new Error('Failed to search contacts');
  }
}
