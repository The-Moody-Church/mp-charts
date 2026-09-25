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
 * | GET    | /get-session                | `authClient.useSession()` — src/components/sign-in/sign-in.tsx, src/contexts/user-context.tsx, src/contexts/session-context.tsx |
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

async function isAllowedSignInSocialBody(request: NextRequest): Promise<boolean> {
  // Pin the content type BEFORE parsing, so this filter and better-auth read
  // the body the same way. better-call matches the header by substring: a
  // multi-valued `text/html, application/json, application/x-www-form-urlencoded`
  // passes its JSON gate and is then parsed as FORM DATA, while
  // `request.json()` here would have read the raw JSON — letting keys past this
  // filter. Exactly `application/json` (parameters allowed) is what our client
  // sends.
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes(",") || contentType.split(";")[0].trim() !== "application/json") {
    return false;
  }
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return false;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const keys = Object.keys(body);
  if (!keys.every((k) => (allowedSignInSocialKeys as readonly string[]).includes(k))) {
    return false;
  }
  return (body as { provider?: unknown }).provider === MP_PROVIDER_ID;
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
