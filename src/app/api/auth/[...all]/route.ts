import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

const { GET: betterAuthGET, POST: betterAuthPOST } = toNextJsHandler(auth);

/**
 * Deny-by-default allowlist of better-auth endpoints reachable over HTTP.
 *
 * better-auth 1.6 mounts ~33 endpoints under this catch-all (session
 * management, account linking, email/password sign-up and sign-in, token
 * issuance, ...). This app's browser client calls exactly three:
 *
 * | Method | Path                                | Caller                                      |
 * |--------|-------------------------------------|---------------------------------------------|
 * | GET    | /get-session                        | `authClient.useSession()` — src/app/signin/page.tsx, src/contexts/user-context.tsx, src/contexts/session-context.tsx |
 * | POST   | /sign-in/oauth2                     | `authClient.signIn.oauth2()` — src/app/signin/page.tsx |
 * | GET    | /oauth2/callback/ministryplatform   | Ministry Platform's redirect after login    |
 *
 * Everything reached through `auth.api.*` runs in-process from server actions
 * and server components and never touches this route, so it needs no entry.
 *
 * NOTE the paths are the better-auth **1.6** genericOAuth names. Upstream
 * MPNext is on 1.7, where the plugin became a first-class social provider and
 * these became `/sign-in/social` and `/callback/ministry-platform`. Whoever
 * does the 1.7 migration must update this list in the same commit, or sign-in
 * 404s here before it reaches better-auth.
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
  GET: ["/get-session", "/oauth2/callback/ministryplatform"],
  POST: ["/sign-in/oauth2"],
} as const;

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
  return betterAuthPOST(request);
}
