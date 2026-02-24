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
