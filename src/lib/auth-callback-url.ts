/**
 * Longest `callbackURL` the `POST /sign-in/social` body filter in
 * src/app/api/auth/[...all]/route.ts accepts, in UTF-16 code units
 * (`String.length`); a longer one gets a 404. Upstream MPNext 48a871b.
 * better-auth copies `callbackURL` into the OAuth state cookie, so an
 * unbounded one is a size DoS.
 *
 * This is the SERVER cap. The sign-in page sends less — see
 * `MAX_SIGN_IN_CALLBACK_URL_LENGTH` below.
 *
 * Plain module with no imports: it is loaded by a client component.
 */
export const MAX_CALLBACK_URL_LENGTH = 2048;

/**
 * Longest callback `getSafeCallbackUrl` in src/components/sign-in/sign-in.tsx
 * sends; for a longer one it sends `/` instead, so a signed-out user following
 * an overlong deep link still signs in (and lands on the home page).
 *
 * It sits BELOW the server cap because the server cap does not fit in a
 * cookie. better-auth stores `callbackURL` in the encrypted, hex-encoded
 * `oauth_state` cookie, whose value is about 556 + 2 × length bytes (measured
 * on better-auth 1.7.5; the callback is ASCII once URL-normalized). Browsers
 * drop a cookie whose name + value exceeds 4096 bytes, and in production the
 * name is `__Secure-better-auth.oauth_state` (32 bytes) — so a callback over
 * 1754 characters is silently not stored, and the MP callback then ends on
 * /auth-error?error=state_mismatch. 1536 leaves 436 bytes of headroom.
 * src/app/api/auth/[...all]/route.test.ts measures the real cookie at this
 * length.
 */
export const MAX_SIGN_IN_CALLBACK_URL_LENGTH = 1536;
