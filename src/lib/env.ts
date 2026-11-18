/**
 * Validated readers for the two auth-critical URLs (audit N19; upstream MPNext
 * 6616310 + 2227a80, adapted: no `NEXTAUTH_URL` fallback — this app reads no
 * NEXTAUTH_* variable).
 *
 * `MINISTRY_PLATFORM_BASE_URL` is the base of everything the app says to
 * Ministry Platform: the client-credentials POST (which carries the client
 * secret), every API call, the userinfo call carrying the user's access token,
 * the authorize/token URLs and the end-session redirect. `BETTER_AUTH_URL` is
 * better-auth's `baseURL`: the OAuth `redirect_uri`, the trusted origin for
 * `callbackURL`, the `post_logout_redirect_uri`, and (through its scheme)
 * whether cookies get `Secure` and the `__Secure-` prefix.
 *
 * Unvalidated, an unset MP URL became `undefined/oauth/...`, a trailing slash
 * produced `//oauth`, and an unset `BETTER_AUTH_URL` fell back to
 * `http://localhost:3000`, which mints non-Secure, unprefixed cookies and
 * breaks sign-in in a confusing way instead of refusing to run.
 *
 * Both readers throw on a bad value and NEVER echo it: a URL can carry
 * credentials (`https://user:pass@host`), and error messages end up in logs.
 * They take the env as an argument (defaulting to `process.env`) so they can
 * be unit tested without re-importing anything.
 *
 * Callers decide when to read them. `src/lib/auth.ts` reads both when it loads,
 * except during `next build` (`NEXT_PHASE=phase-production-build`), which runs
 * with no URL env in CI `verify` and the Docker builder.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** Loopback hosts allowed over plain http. `URL.hostname` keeps IPv6 brackets. */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isProduction(env: Env): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Parses `raw` and applies the checks both URLs share. `name` is the variable
 * name used in error messages; the value itself is never included.
 */
function parseAuthCriticalUrl(
  name: string,
  raw: string | undefined,
  env: Env,
  { loopbackHttpInProduction = false }: { loopbackHttpInProduction?: boolean } = {},
): URL {
  const value = raw?.trim();
  if (!value) {
    throw new Error(`[env] ${name} is not set.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`[env] ${name} is not a valid absolute URL.`);
  }
  const loopbackAllowed = loopbackHttpInProduction || !isProduction(env);
  const loopbackHttp =
    url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname) && loopbackAllowed;
  if (url.protocol !== "https:" && !loopbackHttp) {
    throw new Error(
      loopbackAllowed
        ? `[env] ${name} must use https:// (http:// is allowed only for localhost / 127.0.0.1 / [::1]${loopbackHttpInProduction ? "" : " outside production"}).`
        : `[env] ${name} must use https:// in production.`,
    );
  }
  if (url.username || url.password) {
    throw new Error(`[env] ${name} must not contain credentials.`);
  }
  // `new URL("https://x?")` parses to an empty `search`, so check the raw
  // string too: a stray `?` or `#` means the value is not what was intended.
  if (url.search || url.hash || value.includes("?") || value.includes("#")) {
    throw new Error(`[env] ${name} must not contain a query string or fragment.`);
  }
  return url;
}

/**
 * The Ministry Platform API base URL, e.g.
 * `https://my.church.org/ministryplatformapi`, with no trailing slash, so
 * callers can append `/oauth/...` or `/tables/...` directly.
 *
 * A path IS allowed and kept (production's API lives under
 * `/ministryplatformapi`), unlike `getAuthBaseUrl`. `https:` is required;
 * `http://localhost` / `127.0.0.1` / `[::1]` are accepted only when
 * `NODE_ENV !== "production"`, for a local mock.
 */
export function getMpBaseUrl(env: Env = process.env): string {
  const url = parseAuthCriticalUrl("MINISTRY_PLATFORM_BASE_URL", env.MINISTRY_PLATFORM_BASE_URL, env);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/**
 * The app's own origin (`BETTER_AUTH_URL`), e.g. `https://app.church.org`.
 * Required, with no fallback: not `NEXTAUTH_URL`, and not localhost.
 *
 * Origin only. better-auth appends `/api/auth` itself, and the value is also
 * the exact `post_logout_redirect_uri` registered in MP's TM.Widgets client
 * (no trailing slash), so a path is refused rather than silently dropped; a
 * trailing `/` is tolerated and stripped.
 *
 * `https:` is required for every real host, in every environment.
 * `http://localhost` / `127.0.0.1` / `[::1]` is accepted even when
 * `NODE_ENV=production`, so a local `next start` and the tests that run with
 * NODE_ENV=production work: a loopback origin never leaves the machine, and
 * better-auth leaves cookies non-Secure only for such an http origin. The MP
 * URL stays strict, since it carries the client secret.
 */
export function getAuthBaseUrl(env: Env = process.env): string {
  const url = parseAuthCriticalUrl("BETTER_AUTH_URL", env.BETTER_AUTH_URL, env, {
    loopbackHttpInProduction: true,
  });
  if (url.pathname !== "/") {
    throw new Error("[env] BETTER_AUTH_URL must be an origin only (no path), e.g. https://app.example.org.");
  }
  return url.origin;
}
