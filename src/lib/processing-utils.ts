/**
 * Shared utility functions and constants for processing features
 * (volunteer, baptism, membership).
 */

/** Display name: prefer nickname if present, else first name. */
export function getDisplayName(firstName: string, nickname: string | null): string {
  return nickname && nickname.trim() ? nickname : firstName;
}

/** Two-letter initials from display name + last name. */
export function getInitials(firstName: string, nickname: string | null, lastName: string): string {
  const displayFirst = getDisplayName(firstName, nickname);
  const first = displayFirst?.charAt(0)?.toUpperCase() || "";
  const last = lastName?.charAt(0)?.toUpperCase() || "";
  return first + last;
}

/** Ministry Platform thumbnail URL for a given file GUID. */
export function getImageUrl(baseUrl: string, imageGuid: string): string {
  return `${baseUrl}/${imageGuid}?$thumbnail=true`;
}

/** Format a date string as "Mon D, YYYY" or em-dash for null. */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Allowed MIME types for photo uploads. */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** Allowed MIME types for document uploads (images + PDF). */
export const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];

/** Maximum file size for uploads (1 MB). */
export const MAX_FILE_SIZE = 1 * 1024 * 1024;

/** Normalize apostrophe variants (curly quotes, modifier letter) to ASCII and strip them for comparison. */
function normalizeApostrophes(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC']/g, "");
}

/** Filter processing cards by search query against person name fields. */
export function filterByName<T extends { info: { First_Name: string; Nickname: string | null; Last_Name: string } }>(
  items: T[],
  query: string
): T[] {
  const q = normalizeApostrophes(query.trim().toLowerCase());
  if (!q) return items;
  return items.filter((item) => {
    const { First_Name, Nickname, Last_Name } = item.info;
    const first = normalizeApostrophes(First_Name.toLowerCase());
    const nick = normalizeApostrophes(Nickname?.toLowerCase() ?? "");
    const display = normalizeApostrophes(getDisplayName(First_Name, Nickname).toLowerCase());
    const last = normalizeApostrophes(Last_Name.toLowerCase());
    return (
      first.includes(q) ||
      nick.includes(q) ||
      display.includes(q) ||
      last.includes(q) ||
      `${first} ${last}`.includes(q) ||
      `${display} ${last}`.includes(q) ||
      (nick && `${nick} ${last}`.includes(q))
    );
  });
}
