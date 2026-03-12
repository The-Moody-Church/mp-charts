/**
 * Shared badge color utility for member status badges.
 * Used by contact-lookup-details and contact-lookup search results.
 */

/**
 * Returns Tailwind CSS classes for a member status badge based on the numeric status ID.
 *
 * Status IDs map to Ministry Platform's Member_Status lookup table:
 * - 1: Registered Member (green)
 * - 4: Associate Member (amber)
 * - 10: Youth Member (amber)
 * - 5–9: Dropped/inactive statuses (red)
 * - Other: gray fallback
 */
export function statusBadgeColor(statusId: number | null): string {
  switch (statusId) {
    case 1: return "bg-green-100 text-green-800";
    case 4: return "bg-amber-100 text-amber-800";
    case 10: return "bg-amber-100 text-amber-800";
    case 5: case 6: case 7: case 8: case 9:
      return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}
