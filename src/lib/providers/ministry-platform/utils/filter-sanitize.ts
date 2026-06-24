/**
 * Filter sanitization utilities for Ministry Platform REST API queries.
 *
 * The MP API accepts an OData-style $filter parameter that maps to SQL WHERE clauses.
 * All values interpolated into filter strings MUST be sanitized to prevent filter injection.
 */

/**
 * Escapes a string value for safe interpolation inside a single-quoted filter value.
 * Doubles single quotes (SQL standard escaping) so that input like O'Brien
 * becomes O''Brien and cannot break out of the quoted context.
 */
export function sanitizeFilterValue(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Validates and joins an array of numeric IDs for use in an IN () clause.
 * Filters out non-finite numbers and values <= 0, then joins with commas.
 * Throws if no valid IDs remain (prevents generating an empty IN () clause).
 */
export function sanitizeIds(ids: number[]): string {
  const safe = ids.filter(id => Number.isFinite(id) && id > 0);
  if (safe.length === 0) {
    throw new Error('sanitizeIds: no valid IDs provided');
  }
  return safe.join(',');
}

/**
 * Like sanitizeIds but returns an empty string instead of throwing when the
 * array is empty. Useful for optional filter clauses where an empty set is valid.
 */
export function sanitizeIdsOptional(ids: number[]): string {
  const safe = ids.filter(id => Number.isFinite(id) && id > 0);
  return safe.join(',');
}

/**
 * Validates a single value as a positive integer ID and returns it as a number.
 *
 * Server-action arguments arrive as untrusted React Flight wire data with their
 * TypeScript types erased, so a value annotated `number` can actually be a string
 * such as "1 OR 1=1". Guards like `!id || id <= 0` do NOT catch that (a non-empty
 * string is truthy and `"1 OR 1=1" <= 0` is `NaN <= 0` === false), letting the
 * payload reach a `Col = ${id}` filter interpolation. Route EVERY single-value
 * numeric value that is interpolated into a filter through this function.
 *
 * Accepts: a positive integer `number`, or a digits-only string (optionally
 * surrounded by whitespace). Rejects floats, 0, negatives, NaN/Infinity, and any
 * string containing non-digit characters (e.g. injection payloads).
 */
export function sanitizeId(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('Invalid ID');
    }
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    if (Number.isInteger(n) && n > 0) {
      return n;
    }
  }
  throw new Error('Invalid ID');
}

/**
 * Validates a GUID/UUID string format and returns the sanitized value.
 * Throws if the value does not match the expected UUID v4 pattern.
 */
export function sanitizeGuid(guid: string): string {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!guidRegex.test(guid)) {
    throw new Error('Invalid GUID format');
  }
  return guid;
}
