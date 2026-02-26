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

/**
 * American Soundex: maps phonetically similar names to the same 4-char code.
 * e.g. Johnny, Jonny, Jon → J500; Catherine, Kathryn → C365.
 */
function soundex(s: string): string {
  const str = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (!str) return "";
  const codes: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6",
  };
  let result = str[0];
  let prev = codes[str[0]] ?? "";
  for (let i = 1; i < str.length && result.length < 4; i++) {
    const code = codes[str[i]] ?? "";
    if (code && code !== prev) result += code;
    // H and W are transparent — don't break consecutive duplicate detection
    if (str[i] !== "H" && str[i] !== "W") prev = code;
  }
  return result.padEnd(4, "0");
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
    // Exact substring matching (handles partial queries)
    if (
      first.includes(q) ||
      nick.includes(q) ||
      display.includes(q) ||
      last.includes(q) ||
      `${first} ${last}`.includes(q) ||
      `${display} ${last}`.includes(q) ||
      (nick && `${nick} ${last}`.includes(q))
    ) return true;

    // Soundex matching for spelling variants (Jonny/Johnny, Catherine/Katherine, etc.)
    // Compare digit portions only — the first letter is dropped so C/K, F/Ph, etc. match.
    const queryWords = q.split(/\s+/).filter(Boolean);
    const nameDigits = [first, nick, last].filter(Boolean).map(n => soundex(n).slice(1));
    return queryWords.length > 0 && queryWords.every(
      word => nameDigits.some(nd => nd === soundex(word).slice(1))
    );
  });
}
