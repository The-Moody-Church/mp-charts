/**
 * Shared utility functions and constants for processing features
 * (volunteer, baptism, membership).
 */

import type { BaseCardData, BasePersonInfo } from '@/lib/dto/processing-shared';

/** Available sort options for processing card grids. */
export type ProcessingSortOption = "name" | "most-completed" | "least-completed";

/** Label/value pairs for sort option dropdowns. */
export const SORT_OPTIONS: { value: ProcessingSortOption; label: string }[] = [
  { value: "name", label: "Last Name (A\u2013Z)" },
  { value: "most-completed", label: "Most Completed" },
  { value: "least-completed", label: "Least Completed" },
];

/** Sort processing cards by the selected sort option. Returns a new sorted array. */
export function sortCards<T extends BaseCardData<BasePersonInfo>>(
  items: T[],
  sort: ProcessingSortOption,
): T[] {
  const sorted = [...items];
  switch (sort) {
    case "name":
      sorted.sort((a, b) => {
        const lastCmp = a.info.Last_Name.localeCompare(b.info.Last_Name);
        if (lastCmp !== 0) return lastCmp;
        return a.info.First_Name.localeCompare(b.info.First_Name);
      });
      break;
    case "most-completed":
      sorted.sort((a, b) => {
        if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount;
        return a.info.Last_Name.localeCompare(b.info.Last_Name);
      });
      break;
    case "least-completed":
      sorted.sort((a, b) => {
        if (a.completedCount !== b.completedCount) return a.completedCount - b.completedCount;
        return a.info.Last_Name.localeCompare(b.info.Last_Name);
      });
      break;
  }
  return sorted;
}

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

/** Allowed MIME types for photo uploads (matches MP: PNG, JPG, BMP, GIF). */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];

/** Allowed MIME types for document uploads (matches MP: images + PDF, TXT, CSV). */
export const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf', 'text/plain', 'text/csv'];

/** Maximum file size for uploads (20 MB — matches Ministry Platform limit). */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/**
 * Current date/time formatted as an ISO-like string in Central time.
 * Ministry Platform expects Central time for date fields.
 */
export function nowCentral(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

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

/**
 * Compare two Soundex codes with first-letter equivalence.
 * Matches when: (a) first letters are the same, OR (b) first letters map to the
 * same Soundex digit group (e.g. C/K→2, F/P→1, D/T→3) — AND the digit portions match.
 * This prevents false positives like Huff (H100) matching Sophia (S100) while still
 * catching Catherine/Katherine (C365/K365) and Filip/Philip (F410/P410).
 */
export function soundexMatch(a: string, b: string): boolean {
  const sa = soundex(a);
  const sb = soundex(b);
  if (!sa || !sb || sa.slice(1) !== sb.slice(1)) return false;
  if (sa[0] === sb[0]) return true;
  // Check if first letters belong to the same Soundex digit group
  const groups: Record<string, string> = {
    B: "1", F: "1", P: "1", V: "1",
    C: "2", G: "2", J: "2", K: "2", Q: "2", S: "2", X: "2", Z: "2",
    D: "3", T: "3",
    L: "4",
    M: "5", N: "5",
    R: "6",
  };
  const ga = groups[sa[0]];
  const gb = groups[sb[0]];
  return !!ga && ga === gb;
}

/**
 * Levenshtein edit distance between two strings.
 * Returns the minimum number of single-character edits (insert, delete, replace).
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Use single-row DP for memory efficiency
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/** Check if a query term is a close misspelling of a name (max edit distance based on length). */
function fuzzyMatch(term: string, name: string): boolean {
  if (!term || !name) return false;
  const maxDist = term.length < 5 ? 1 : 2;
  return levenshtein(term, name) <= maxDist;
}

/** Name fields used for scoring. */
interface NameFields {
  First_Name: string;
  Nickname: string | null;
  Last_Name: string;
  Email_Address?: string | null;
  Mobile_Phone?: string | null;
}

/** Strip non-digit characters from a string for phone comparison. */
function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Score an email address against a query. Returns 0 if no match. */
function scoreEmailMatch(email: string | null | undefined, query: string): number {
  if (!email) return 0;
  const e = email.toLowerCase();
  if (e === query) return 8;
  // Match against the local part (before @)
  const local = e.split("@")[0];
  if (local === query) return 7;
  if (local.startsWith(query)) return 5;
  if (e.includes(query)) return 3;
  return 0;
}

/** Score a phone number against a query. Only matches when query contains digits. */
function scorePhoneMatch(phone: string | null | undefined, query: string): number {
  if (!phone) return 0;
  const queryDigits = digitsOnly(query);
  if (queryDigits.length < 3) return 0; // Need at least 3 digits to match
  const phoneDigits = digitsOnly(phone);
  if (!phoneDigits) return 0;
  if (phoneDigits === queryDigits) return 8;
  // Match last N digits (people often search by the 7 or 10 digit number without country code)
  if (phoneDigits.endsWith(queryDigits)) return 7;
  if (phoneDigits.includes(queryDigits)) return 5;
  return 0;
}

/** Classify a search word: digits-only → phone, contains @ → email, else → name */
function classifySearchWord(word: string): "phone" | "email" | "name" {
  if (/^\d+$/.test(word)) return "phone";
  if (word.includes("@")) return "email";
  return "name";
}

/**
 * Score a single name record against a search query.
 * Higher scores = closer match. Returns 0 for no match.
 *
 * Multi-word queries are split by type: digits-only words search phone,
 * words with @ search email, all other words search name fields.
 * All parts must match for a result to be returned.
 */
export function scoreNameMatch(fields: NameFields, query: string): number {
  const q = normalizeApostrophes(query.trim().toLowerCase());
  if (!q) return 0;

  const first = normalizeApostrophes((fields.First_Name ?? "").toLowerCase());
  const nick = normalizeApostrophes((fields.Nickname ?? "").toLowerCase());
  const display = normalizeApostrophes(getDisplayName(fields.First_Name ?? "", fields.Nickname).toLowerCase());
  const last = normalizeApostrophes((fields.Last_Name ?? "").toLowerCase());

  const queryWords = q.split(/[\s,]+/).filter(Boolean);

  // Classify each word by type
  const nameWords: string[] = [];
  const phoneWords: string[] = [];
  const emailWords: string[] = [];
  for (const word of queryWords) {
    const type = classifySearchWord(word);
    if (type === "phone") phoneWords.push(word);
    else if (type === "email") emailWords.push(word);
    else nameWords.push(word);
  }

  // If the query is mixed (has phone/email + name parts), score each part independently.
  // All parts must match for the record to be included.
  const hasMixedTypes = (phoneWords.length > 0 || emailWords.length > 0) && nameWords.length > 0;

  if (hasMixedTypes) {
    let totalScore = 0;

    // Score phone words
    for (const pw of phoneWords) {
      const ps = scorePhoneMatch(fields.Mobile_Phone, pw);
      if (ps === 0) return 0; // all parts must match
      totalScore += ps;
    }

    // Score email words
    for (const ew of emailWords) {
      const es = scoreEmailMatch(fields.Email_Address, ew);
      if (es === 0) return 0; // all parts must match
      totalScore += es;
    }

    // Score name words using the name query portion
    const nameQuery = nameWords.join(" ");
    const ns = scoreNameOnly(nameQuery, nameWords, first, nick, display, last);
    if (ns === 0) return 0; // all parts must match
    totalScore += ns;

    return totalScore;
  }

  // Non-mixed query: use existing logic (single type)
  return scoreNameOnly(q, queryWords, first, nick, display, last, fields);
}

/**
 * Score name fields against a query. When `fields` is provided, falls back to email/phone
 * for unmatched queries. Used both for pure name queries and the name portion of mixed queries.
 */
function scoreNameOnly(
  q: string,
  queryWords: string[],
  first: string,
  nick: string,
  display: string,
  last: string,
  fields?: NameFields,
): number {
  // Single-word scoring: score against all name fields equally
  if (queryWords.length === 1) {
    const term = queryWords[0];
    let score = 0;

    // Check name fields: exact > starts-with (with proportional bonus) > contains
    for (const name of [first, nick, display, last].filter(Boolean)) {
      if (name === term) score = Math.max(score, 40);
      else if (name.startsWith(term)) score = Math.max(score, 25 + (term.length >= 3 ? Math.round(10 * term.length / name.length) : 0));
      else if (name.includes(term)) score = Math.max(score, 10);
    }

    // Full name combination match
    if (`${first} ${last}`.includes(term) || `${display} ${last}`.includes(term) ||
        (nick && `${nick} ${last}`.includes(term))) {
      score = Math.max(score, 10);
    }

    // Soundex fallback (with first-letter equivalence to avoid false positives)
    if (score === 0) {
      if ([first, nick, last].filter(Boolean).some(n => soundexMatch(term, n))) {
        score = 1;
      }
    }

    // Levenshtein fuzzy fallback for misspellings (e.g. "huerra" → "guerra")
    if (score === 0) {
      if ([first, nick, last].filter(Boolean).some(n => fuzzyMatch(term, n))) {
        score = 1;
      }
    }

    // Email and phone fallback for single-word queries (only for non-mixed queries)
    if (score === 0 && fields) {
      score = Math.max(
        scoreEmailMatch(fields.Email_Address, q),
        scorePhoneMatch(fields.Mobile_Phone, q)
      );
    }

    return score;
  }

  // Multi-word scoring helper: scores a (firstGuess, lastGuess) interpretation
  function scoreInterpretation(firstGuess: string, lastGuess: string): number {
    let score = 0;
    let firstMatched = false;
    let lastMatched = false;

    // Score last name match (prefix matches get a proportional bonus for coverage)
    if (last === lastGuess) { score += 40; lastMatched = true; }
    else if (last.startsWith(lastGuess)) {
      score += 25 + (lastGuess.length >= 3 ? Math.round(10 * lastGuess.length / last.length) : 0);
      lastMatched = true;
    }
    else if (last.includes(lastGuess)) { score += 10; lastMatched = true; }

    // Score first name / nickname match — take the best match across fields
    // Prefix matches get a proportional bonus for coverage
    let firstScore = 0;
    for (const name of [first, nick, display].filter(Boolean)) {
      if (name === firstGuess) { firstScore = Math.max(firstScore, 30); }
      else if (name.startsWith(firstGuess)) {
        firstScore = Math.max(firstScore, 20 + (firstGuess.length >= 3 ? Math.round(5 * firstGuess.length / name.length) : 0));
      }
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

    // Soundex + fuzzy fallback for unmatched parts
    if (!firstMatched || !lastMatched) {
      const nameFields = [first, nick, last].filter(Boolean);
      const allPhoneticMatch = queryWords.every(
        word => nameFields.some(n => soundexMatch(word, n) || fuzzyMatch(word, n))
      );
      if (allPhoneticMatch) {
        if (!firstMatched) score += 1;
        if (!lastMatched) score += 1;
      } else if (score === 0) {
        return 0;
      }
    }

    return score;
  }

  // Try both "First Last" and "Last First" interpretations, take the best score.
  // Comma forces "Last, First" only.
  let score: number;
  if (q.includes(",")) {
    const parts = q.split(",").map(p => p.trim()).filter(Boolean);
    score = scoreInterpretation(
      normalizeApostrophes(parts[parts.length > 1 ? 1 : 0]),
      normalizeApostrophes(parts[0])
    );
  } else {
    const firstLast = scoreInterpretation(queryWords[0], queryWords[queryWords.length - 1]);
    const lastFirst = scoreInterpretation(queryWords[queryWords.length - 1], queryWords[0]);
    score = Math.max(firstLast, lastFirst);
  }

  if (score === 0 && fields) {
    // Email matching (lower priority than name matches)
    score = Math.max(score, scoreEmailMatch(fields.Email_Address, q));

    // Phone matching (only when query contains digits)
    score = Math.max(score, scorePhoneMatch(fields.Mobile_Phone, q));
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
    const lastCmp = (a.item.info.Last_Name ?? "").localeCompare(b.item.info.Last_Name ?? "");
    if (lastCmp !== 0) return lastCmp;
    return (a.item.info.First_Name ?? "").localeCompare(b.item.info.First_Name ?? "");
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
    const lastCmp = (a.item.Last_Name ?? "").localeCompare(b.item.Last_Name ?? "");
    if (lastCmp !== 0) return lastCmp;
    return (a.item.First_Name ?? "").localeCompare(b.item.First_Name ?? "");
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
