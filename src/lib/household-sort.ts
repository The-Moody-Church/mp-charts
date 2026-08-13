/**
 * The subset of a household member record this sort needs. Declared structurally
 * rather than importing HouseholdMember from the DTO barrel, so this stays a pure,
 * dependency-free helper (same convention as MilestoneSource in
 * journey-tools-config-types.ts).
 */
export interface HouseholdSortable {
  Contact_ID: number;
  Household_Position_ID: number | null;
  Date_of_Birth: string | null;
}

/** Members with no household position sort after everyone who has one. */
const NO_POSITION = 999;

/**
 * Order a household for display on a contact card: the contact themselves is
 * removed, then members are grouped by household position (Head of Household
 * first) and, within a position, oldest first.
 *
 * A member with no `Date_of_Birth` sorts after one who has it, so an unknown
 * birthday never displaces a known one. `Date_of_Birth` is an MP date string
 * (`YYYY-MM-DD...`), so a lexicographic compare is also a chronological one — no
 * Date parsing, and therefore none of the UTC-shift hazard described in CLAUDE.md.
 *
 * Returns a new array; the input is never mutated.
 */
export function sortHouseholdMembers<T extends HouseholdSortable>(
  members: T[],
  excludeContactId: number
): T[] {
  return members
    .filter((m) => m.Contact_ID !== excludeContactId)
    .sort((a, b) => {
      const posA = a.Household_Position_ID ?? NO_POSITION;
      const posB = b.Household_Position_ID ?? NO_POSITION;
      if (posA !== posB) return posA - posB;
      if (!a.Date_of_Birth && !b.Date_of_Birth) return 0;
      if (!a.Date_of_Birth) return 1;
      if (!b.Date_of_Birth) return -1;
      return a.Date_of_Birth.localeCompare(b.Date_of_Birth);
    });
}
