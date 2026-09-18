/**
 * Content-Security-Policy construction (F9), ported from upstream MPNext.
 *
 * WHY THIS IS NOT IN `next.config.ts`
 *
 * A nonce has to be fresh per request. A value fixed at build time is a
 * constant that an attacker can read off any page, so it protects nothing.
 * `next.config.ts`'s `headers()` runs once at build time, so the CSP is built
 * here and applied from `src/proxy.ts` instead.
 *
 * The request-independent headers (X-Frame-Options, HSTS, Referrer-Policy,
 * COOP/CORP, ...) stay in `next.config.ts`. That is deliberate and is not an
 * oversight: the proxy matcher skips `_next/static`, `_next/image`,
 * `favicon.ico` and `assets/`, so a header set only in the proxy would miss
 * them. Upstream also moved those into this module; we did not, because our
 * set is already richer than theirs and rewriting working headers is not what
 * this change is for.
 *
 * That split is why anti-framing is expressed twice — `X-Frame-Options` in the
 * config and `frame-ancestors` here. They are not redundant. The CSP only
 * reaches routes the proxy runs on; `X-Frame-Options` reaches everything.
 */

/**
 * Parses an origin out of a configured URL.
 *
 * Returns null rather than throwing for anything unusable. This runs on the
 * request path in `src/proxy.ts`, where a missing or malformed environment
 * variable must degrade to a TIGHTER policy and never take the app down.
 */
export function originOf(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Generates a fresh CSP nonce: 16 random bytes, base64.
 *
 * `crypto.getRandomValues` + `btoa` rather than the `Buffer.from(randomUUID())`
 * form in Next's own CSP guide. A UUID is 122 bits of entropy wrapped in 36
 * bytes of hex and dashes, and `Buffer` is Node-only. This is shorter, denser,
 * and keeps working if the proxy ever runs on a non-Node runtime.
 */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export interface CspOptions {
  /**
   * Per-request nonce. Next reads this back off the REQUEST header during
   * render and stamps it onto its own script tags.
   */
  nonce: string;
  /** Loosens the policy for the dev server's tooling. */
  isDev?: boolean;
  /**
   * Whether this will be sent as `Content-Security-Policy-Report-Only`.
   *
   * Only affects `upgrade-insecure-requests`, which browsers refuse to honor
   * in a report-only policy and complain about on every page load. Emitting it
   * there buys nothing and buries the real violation reports, which are the
   * entire point of report-only mode.
   */
  reportOnly?: boolean;
  /**
   * Origin of the Ministry Platform file server, for contact photos. These are
   * `next/image` with `unoptimized`, so the BROWSER fetches them straight from
   * MP; they never pass through this app's image optimizer. Without this
   * origin in `img-src`, every avatar breaks.
   */
  imageOrigin?: string | null;
  /**
   * Origin of the Ministry Platform OAuth server, for `form-action`.
   *
   * Sign-out is a `<form action={handleSignOut}>` server action ending in a
   * `redirect()` to MP's `/oauth/connect/endsession`. Browsers apply
   * `form-action` to the WHOLE redirect chain a form submission produces, not
   * just its first hop, so `'self'` alone can abort sign-out at the redirect.
   *
   * Pass null where sign-out never leaves this origin.
   */
  formActionOrigin?: string | null;
}

/**
 * Builds the Content-Security-Policy value for one request.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDev = false,
  reportOnly = false,
  imageOrigin = null,
  formActionOrigin = null,
}: CspOptions): string {
  const directives: string[] = [
    "default-src 'self'",

    // `strict-dynamic` means the allow-list in this directive is IGNORED by
    // browsers that understand it: trust flows from the nonced framework
    // bootstrap to whatever it loads, so Next's chunk loading keeps working
    // without naming every chunk. `'self'` stays for older browsers, which
    // ignore `strict-dynamic` instead.
    //
    // `'unsafe-eval'` in dev only: React uses `eval` there to rebuild
    // server-side error stacks in the browser. Neither React nor Next uses it
    // in a production build.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,

    // NOT upstream's policy. We register a service worker
    // (`navigator.serviceWorker.register("/sw.js")` in `src/app/providers.tsx`)
    // and upstream does not.
    //
    // `worker-src` has no default of its own — it falls back to `child-src`,
    // then to `script-src`. Falling through to the directive above would be
    // fatal, because `'strict-dynamic'` makes browsers IGNORE the `'self'`
    // there, and a worker script cannot carry a nonce. Without this line the
    // service worker fails to register under enforcement.
    "worker-src 'self'",

    // DELIBERATE LOOSENING. Do not "tighten" this back to a nonce.
    //
    // Upstream tried exactly that — `style-src 'self' 'nonce-...'` plus a
    // separate `style-src-attr 'unsafe-inline'` — on the theory that a nonce
    // could cover real stylesheets while the attr directive covered Radix's
    // inline `style` attributes. Enforcing it in a browser disproved it:
    // Radix's dialog pulls in react-remove-scroll, which locks body scroll by
    // INJECTING A <style> ELEMENT at runtime. That is an element, not an
    // attribute, so `style-src-attr` does not apply and it falls through to
    // `style-src`, where a nonce cannot help — the element is created by
    // script long after the server chose the nonce. The dialog broke with
    // React error #441.
    //
    // A hash is not a workable alternative either: the injected content
    // includes the computed scrollbar width, so it varies by platform and zoom
    // level. Upstream saw two different hashes in a single page view.
    //
    // All four of our repos have react-remove-scroll installed via Radix, so
    // this applies to us unchanged.
    //
    // `'unsafe-inline'` must appear WITHOUT a nonce: a nonce in the same
    // directive makes CSP3 browsers ignore `'unsafe-inline'` entirely, which
    // is the trap that produced the broken policy above.
    //
    // The security cost is real but small. Inline STYLE injection allows
    // limited data exfiltration through selectors, but not script execution.
    // The control that matters — `script-src` with a nonce and
    // `strict-dynamic` — is untouched.
    "style-src 'self' 'unsafe-inline'",

    // `data:` and `blob:` are next/image's placeholder and preview machinery.
    `img-src 'self' data: blob:${imageOrigin ? ` ${imageOrigin}` : ""}`,

    // Tailwind is compiled at build time and there is no `next/font` or Google
    // Fonts link in any of these apps, so everything is same-origin. `data:`
    // is kept because music-db's previous static policy allowed it and a
    // data-URI font cannot execute.
    "font-src 'self' data:",

    // Every Ministry Platform call is server-side; the browser only ever talks
    // to this origin. `ws:` is the dev server's HMR socket.
    //
    // Tighter than music-db's previous static policy, which allowed
    // `https://*.ministryplatform.com` here. Report-only mode exists to prove
    // whether that was load-bearing or just copied.
    `connect-src 'self'${isDev ? " ws:" : ""}`,

    "object-src 'none'",
    "frame-src 'none'",

    // Stops an injected <base> from re-pointing every relative URL on the page.
    "base-uri 'self'",

    `form-action 'self'${formActionOrigin ? ` ${formActionOrigin}` : ""}`,

    // The CSP-level anti-framing control. `X-Frame-Options` in next.config.ts
    // covers the routes the proxy matcher skips.
    "frame-ancestors 'none'",
  ];

  // Production only: the directive rewrites http subresource URLs to https,
  // which is exactly wrong against a local http dev server. Also omitted in
  // report-only mode, where browsers ignore it and log an error saying so on
  // every page.
  if (!isDev && !reportOnly) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

/**
 * Which CSP header name to send.
 *
 * REPORTS ONLY by default. Enforcement requires `CSP_ENFORCE=true` exactly;
 * any other value, including unset or a typo, reports.
 *
 * This is deliberately INVERTED from upstream, which enforces unless
 * `CSP_ENFORCE=false`. Upstream earned that default: they walked an enforced
 * policy through a production build in a browser on 2026-09-12, and that walk
 * caught a blocked runtime-injected `<style>` that report-only had NOT
 * reported. We have not done our walk yet.
 *
 * Until we have, the failure we must not allow is a deploy that enforces
 * because someone forgot an environment variable. A nonce CSP is the one
 * security header that can white-screen an app. Flip this default in its own
 * change, after a clean enforced walk, so the flip is the reviewable event.
 */
export function cspHeaderName(
  enforce: boolean = process.env.CSP_ENFORCE === "true"
): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}
