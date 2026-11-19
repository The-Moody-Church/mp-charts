/**
 * Input guards shared by the provider services (batch 3; upstream MPNext 41bba94,
 * adapted: errors are logged with `errorForLog` from `@/lib/log-safe`, not a
 * separate name-only helper).
 *
 * These services are thin passthroughs to an admin-level service account, so a
 * value they put in a request path is checked here, whatever the caller (or
 * HttpClient's central `assertSafeEndpoint`) already did. TypeScript types are
 * erased at runtime: a `string` table name can hold `../procs/...`.
 */

/**
 * A SQL-style identifier: a letter or underscore, then letters, digits or
 * underscores. Covers every MP table and stored procedure name (`Contacts`,
 * `dp_Users`, `_Deployments`, `api_Custom_Get_Contacts`) and admits nothing
 * that could change the shape of a URL path (`.`, `/`, `\`, `?`, `#`, `%`).
 */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** SQL Server's `sysname` limit. */
const MAX_IDENTIFIER_LENGTH = 128;

/**
 * Validates a table or procedure name for use as a URL path segment.
 *
 * @param value - The candidate name, from any source
 * @param field - Names the value in the error message (the value itself never appears)
 * @returns The validated name, unchanged
 * @throws Error `Invalid <field>` if the value is not a string, is longer than
 *   128 characters, or is not a plain identifier
 */
export function sanitizeIdentifier(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length > MAX_IDENTIFIER_LENGTH ||
    !IDENTIFIER_PATTERN.test(value)
  ) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}
