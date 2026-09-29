/**
 * Longest `callbackURL` the sign-in flow carries, in UTF-16 code units
 * (`String.length`). Upstream MPNext 48a871b.
 *
 * Enforced in two places, which must agree — so both read this constant:
 *
 * - the `POST /sign-in/social` body filter in
 *   src/app/api/auth/[...all]/route.ts refuses a longer one with a 404
 *   (better-auth copies `callbackURL` into the OAuth state cookie, so an
 *   unbounded one is a size DoS);
 * - `getSafeCallbackUrl` in src/components/sign-in/sign-in.tsx sends `/`
 *   instead of a longer one, so a signed-out user following an overlong deep
 *   link still signs in (and lands on the home page) rather than hitting that
 *   404 and /auth-error.
 *
 * Plain module with no imports: it is loaded by a client component.
 */
export const MAX_CALLBACK_URL_LENGTH = 2048;
