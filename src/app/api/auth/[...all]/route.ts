import { auth } from "@/lib/auth";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

const { GET: betterAuthGET, POST: betterAuthPOST } = toNextJsHandler(auth);

/**
 * Deny-by-default allowlist of better-auth endpoints reachable over HTTP.
 *
 * better-auth 1.7.5 mounts 30 endpoints under this catch-all. This app's
 * browser client calls exactly three:
 *
 * | Method | Path                        | Caller                                               |
 * |--------|-----------------------------|------------------------------------------------------|
 * | GET    | /get-session                | `authClient.useSession()` — src/components/sign-in/sign-in.tsx, src/contexts/user-context.tsx, src/contexts/session-context.tsx; `authClient.getSession()` — src/components/user-menu/user-menu.tsx (re-mints the cookie cache before sign-out) |
 * | POST   | /sign-in/social             | `authClient.signIn.social()` — src/components/sign-in/sign-in.tsx |
 * | GET    | /callback/ministryplatform  | Ministry Platform's redirect after login              |
 *
 * `/callback/ministryplatform` is `/callback/${MP_PROVIDER_ID}` — OUR provider
 * id, no hyphen. Upstream MPNext's is `ministry-platform`; do not copy theirs.
 * The redirect URI registered on MP's TM.Widgets client must be
 * `${BETTER_AUTH_URL}/api/auth/callback/ministryplatform`.
 *
 * Everything reached through `auth.api.*` runs in-process from server actions
 * and server components and never touches this route, so it needs no entry.
 *
 * `/sign-out` is deliberately absent: sign-out runs server-side via
 * `auth.api.signOut` in src/components/user-menu/actions.ts. Adding
 * `authClient.signOut()` in the browser would require adding `POST /sign-out`
 * here first — the 404 makes that omission loud instead of silent.
 *
 * `/error` is deliberately absent: OAuth callback failures now redirect to our
 * own /auth-error page via `onAPIError.errorURL` in src/lib/auth.ts.
 *
 * This is the PRIMARY control — closed to any endpoint a future better-auth
 * version adds, until it is deliberately opened here. `disabledAuthPaths` in
 * src/lib/auth.ts is defense in depth. (F7, upstream MPNext 91d226f.)
 */
export const allowedAuthRoutes = {
  GET: ["/get-session", "/callback/ministryplatform"],
  POST: ["/sign-in/social"],
} as const;

/**
 * The ONLY body keys POST /sign-in/social may carry. 1.7's endpoint also
 * accepts `idToken` (a state-less session-minting branch), `scopes` (merged
 * into the authorize request — would re-open offline_access despite
 * auth-scopes.test.ts), `additionalParams`, `loginHint`, `requestSignUp`,
 * `errorCallbackURL` (overrides onAPIError.errorURL), `newUserCallbackURL` and
 * `additionalData`. Our client sends exactly these two.
 */
export const allowedSignInSocialKeys = ["provider", "callbackURL"] as const;

/**
 * Largest `POST /sign-in/social` body this route will read, in bytes. Our
 * client sends `{ provider, callbackURL }` — a few hundred bytes at most, and
 * under ~2.1 KB even at the `callbackURL` cap below. Without a cap, one
 * anonymous request with a multi-megabyte relative `callbackURL` passes
 * better-auth's `isSafeRelativeURL`, is copied into the encrypted OAuth state
 * cookie, and comes back as a Set-Cookie roughly twice its size (memory/CPU
 * denial of service) — and this filter runs BEFORE better-auth's rate
 * limiter. (Upstream MPNext 48a871b.)
 */
const MAX_SIGN_IN_SOCIAL_BODY_BYTES = 4096;

/** Longest `callbackURL` accepted (UTF-16 code units, i.e. `String.length`). */
const MAX_CALLBACK_URL_LENGTH = 2048;

/**
 * Read a request body with a hard byte cap. Returns `null` (and stops reading)
 * as soon as more than `limit` bytes arrive, so a chunked body with no
 * Content-Length — or one that lies about it — is never buffered past the cap.
 */
async function readBodyWithLimit(
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      // Stop reading; do NOT `await reader.cancel()`. This is a `clone()`
      // (a tee branch), and a tee branch's cancel promise settles only once
      // BOTH branches are cancelled — the original never is on this path, so
      // awaiting it hangs the request. Releasing the lock is enough: a tee
      // pulls from its source only when a branch is read, and neither will be.
      reader.releaseLock();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Body filter for `POST /sign-in/social`. Every refusal — wrong content type,
 * oversized, unparseable JSON, a non-object, an unknown key, a different
 * provider, a non-string or overlong `callbackURL` — gets the same 404 as a
 * non-allowlisted path, so the filter reveals nothing about which check
 * tripped.
 *
 * Size is capped twice: a declared Content-Length over
 * `MAX_SIGN_IN_SOCIAL_BODY_BYTES` (or a malformed one) is refused before
 * anything is cloned or read, and the clone is then read with the same hard
 * cap (a chunked body carries no Content-Length). The capped bytes are parsed
 * the way better-call's `request.json()` parses them — the Fetch spec's "parse
 * JSON from bytes": UTF-8 decode with a leading BOM stripped and invalid
 * sequences replaced (what `new TextDecoder()` does with its defaults), then
 * `JSON.parse`. So the filter and better-auth still see the same object.
 *
 * Reads a `clone()` so the original body stream is still intact for
 * better-auth.
 */
async function isAllowedSignInSocialBody(request: NextRequest): Promise<boolean> {
  // Pin the content type BEFORE parsing, so this filter and better-auth read
  // the body the same way. better-call matches the header by substring: a
  // multi-valued `text/html, application/json, application/x-www-form-urlencoded`
  // passes its JSON gate and is then parsed as FORM DATA, while this filter
  // would have read the raw JSON — letting keys past it. Exactly
  // `application/json` (parameters allowed) is what our client sends. A
  // repeated Content-Type header arrives here comma-joined, so it is refused
  // by the same rule.
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes(",") || contentType.split(";")[0].trim() !== "application/json") {
    return false;
  }
  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_SIGN_IN_SOCIAL_BODY_BYTES)
  ) {
    return false;
  }
  const stream = request.clone().body;
  if (stream === null) return false;
  let body: unknown;
  try {
    const bytes = await readBodyWithLimit(stream, MAX_SIGN_IN_SOCIAL_BODY_BYTES);
    if (bytes === null) return false;
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return false;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  if (!keys.every((k) => (allowedSignInSocialKeys as readonly string[]).includes(k))) {
    return false;
  }
  const { provider, callbackURL } = body as { provider?: unknown; callbackURL?: unknown };
  if (
    "callbackURL" in body &&
    (typeof callbackURL !== "string" || callbackURL.length > MAX_CALLBACK_URL_LENGTH)
  ) {
    return false;
  }
  return provider === MP_PROVIDER_ID;
}

/**
 * Path of the request relative to this route's mount point (`/api/auth`), with
 * trailing slashes stripped. Exact string matching only — no regex, no prefix
 * matching — so `/get-session/../list-accounts` (which `NextRequest`/`URL`
 * normalizes to `/api/auth/list-accounts` before this runs) resolves to a real
 * but non-allowlisted path, and `/get-sessionX` simply never equals an entry.
 */
function relativeAuthPath(request: NextRequest): string {
  const { pathname } = request.nextUrl;
  const withoutPrefix = pathname.startsWith("/api/auth")
    ? pathname.slice("/api/auth".length)
    : pathname;
  const withoutTrailingSlashes = withoutPrefix.replace(/\/+$/, "");
  return withoutTrailingSlashes === "" ? "/" : withoutTrailingSlashes;
}

const NOT_FOUND = () => new Response("Not Found", { status: 404 });

export async function GET(request: NextRequest) {
  const path = relativeAuthPath(request);
  if (!(allowedAuthRoutes.GET as readonly string[]).includes(path)) {
    return NOT_FOUND();
  }
  return betterAuthGET(request);
}

export async function POST(request: NextRequest) {
  const path = relativeAuthPath(request);
  if (!(allowedAuthRoutes.POST as readonly string[]).includes(path)) {
    return NOT_FOUND();
  }
  if (path === "/sign-in/social" && !(await isAllowedSignInSocialBody(request))) {
    return NOT_FOUND();
  }
  return betterAuthPOST(request);
}
