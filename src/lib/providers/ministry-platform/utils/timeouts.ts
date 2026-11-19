/**
 * Deadlines for every request the MP client makes, in one place (batch 3,
 * audit N12; upstream MPNext 9b7b4d1 / 5aa0b5e, adapted). Without a deadline a
 * stalled MP holds the request until undici's 300 s default.
 *
 * The userinfo call made during sign-in has its own 10 s deadline,
 * `USERINFO_TIMEOUT_MS` in `src/lib/auth.ts`.
 */

/**
 * A JSON API call through `HttpClient`. 30 s, not upstream's 20 s: F13 chose it,
 * and cold dashboard reads (the Activity_Log months) are slow enough that a
 * shorter deadline would turn into new all-or-nothing rejections.
 */
export const MP_API_TIMEOUT_MS = 30_000;

/** A multipart upload (`postFormData` / `putFormData`): file bodies up to 20 MB. */
export const MP_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * The client-credentials token request. It gates every MP call, so a stalled
 * token endpoint must fail fast.
 */
export const MP_TOKEN_TIMEOUT_MS = 10_000;
