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
export function normalizeApostrophes(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC']/g, "");
}

/**
 * American Soundex: maps phonetically similar names to the same 4-char code.
 * e.g. Johnny, Jonny, Jon → J500; Catherine, Kathryn → C365.
 */
export function soundex(s: string): string {
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

/** Name fields used for scoring. */
interface NameFields {
  First_Name: string;
  Nickname: string | null;
  Last_Name: string;
}

/**
 * Score a single name record against a search query.
 * Higher scores = closer match. Returns 0 for no match.
 */
function scoreNameMatch(fields: NameFields, query: string): number {
  const q = normalizeApostrophes(query.trim().toLowerCase());
  if (!q) return 0;

  const first = normalizeApostrophes(fields.First_Name.toLowerCase());
  const nick = normalizeApostrophes(fields.Nickname?.toLowerCase() ?? "");
  const display = normalizeApostrophes(getDisplayName(fields.First_Name, fields.Nickname).toLowerCase());
  const last = normalizeApostrophes(fields.Last_Name.toLowerCase());

  const queryWords = q.split(/\s+/).filter(Boolean);

  // Single-word scoring: score against all name fields equally
  if (queryWords.length === 1) {
    const term = queryWords[0];
    let score = 0;

    // Check name fields: exact > starts-with > contains
    for (const name of [first, nick, display, last].filter(Boolean)) {
      if (name === term) score = Math.max(score, 40);
      else if (name.startsWith(term)) score = Math.max(score, 25);
      else if (name.includes(term)) score = Math.max(score, 10);
    }

    // Full name combination match
    if (`${first} ${last}`.includes(term) || `${display} ${last}`.includes(term) ||
        (nick && `${nick} ${last}`.includes(term))) {
      score = Math.max(score, 10);
    }

    // Soundex fallback
    if (score === 0) {
      const termDigits = soundex(term).slice(1);
      const nameDigits = [first, nick, last].filter(Boolean).map(n => soundex(n).slice(1));
      if (termDigits && nameDigits.some(nd => nd === termDigits)) {
        score = 1;
      }
    }

    return score;
  }

  // Multi-word scoring: firstGuess + lastGuess
  const firstGuess = queryWords[0];
  const lastGuess = queryWords[queryWords.length - 1];
  let score = 0;
  let firstMatched = false;
  let lastMatched = false;

  // Score last name match
  if (last === lastGuess) { score += 40; lastMatched = true; }
  else if (last.startsWith(lastGuess)) { score += 25; lastMatched = true; }
  else if (last.includes(lastGuess)) { score += 10; lastMatched = true; }

  // Score first name / nickname match — take the best match across fields
  let firstScore = 0;
  for (const name of [first, nick, display].filter(Boolean)) {
    if (name === firstGuess) { firstScore = Math.max(firstScore, 30); }
    else if (name.startsWith(firstGuess)) { firstScore = Math.max(firstScore, 20); }
    else if (name.includes(firstGuess)) { firstScore = Math.max(firstScore, 5); }
  }
  if (firstScore > 0) {
    score += firstScore;
    firstMatched = true;
  }

  // Both matched bonus
  if (firstMatched && lastMatched) {
    score += 20;
  }

  // Full query in "first last" combination
  if (`${first} ${last}`.includes(q) || `${display} ${last}`.includes(q) ||
      (nick && `${nick} ${last}`.includes(q))) {
    score += 15;
  }

  // Soundex fallback for unmatched parts
  if (!firstMatched || !lastMatched) {
    const nameDigits = [first, nick, last].filter(Boolean).map(n => soundex(n).slice(1));
    const allSoundexMatch = queryWords.every(
      word => nameDigits.some(nd => nd === soundex(word).slice(1))
    );
    if (allSoundexMatch) {
      if (!firstMatched) score += 1;
      if (!lastMatched) score += 1;
    } else if (score === 0) {
      // No match at all
      return 0;
    }
  }

  return score;
}

/**
 * Search and rank processing cards by name match quality.
 * Returns matched items sorted by relevance (best matches first).
 * Items with no match are excluded.
 */
export function searchByName<T extends { info: NameFields }>(
  items: T[],
  query: string
): T[] {
  const q = query.trim();
  if (!q) return items;

  const scored = items
    .map(item => ({ item, score: scoreNameMatch(item.info, q) }))
    .filter(({ score }) => score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const lastCmp = a.item.info.Last_Name.localeCompare(b.item.info.Last_Name);
    if (lastCmp !== 0) return lastCmp;
    return a.item.info.First_Name.localeCompare(b.item.info.First_Name);
  });

  return scored.map(({ item }) => item);
}

/**
 * Search and rank flat records (without nested .info) by name match quality.
 * Used by contact lookup where records have flat First_Name/Last_Name fields.
 */
export function searchByNameFlat<T extends NameFields>(
  items: T[],
  query: string
): T[] {
  const q = query.trim();
  if (!q) return items;

  const scored = items
    .map(item => ({ item, score: scoreNameMatch(item, q) }))
    .filter(({ score }) => score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const lastCmp = a.item.Last_Name.localeCompare(b.item.Last_Name);
    if (lastCmp !== 0) return lastCmp;
    return a.item.First_Name.localeCompare(b.item.First_Name);
  });

  return scored.map(({ item }) => item);
}

/** @deprecated Use searchByName instead — same filtering with ranked results. */
export function filterByName<T extends { info: NameFields }>(
  items: T[],
  query: string
): T[] {
  return searchByName(items, query);
}
