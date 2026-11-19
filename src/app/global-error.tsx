"use client";

import { useEffect, useSyncExternalStore } from "react";

const BUTTON_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#344767",
  color: "#fff",
  border: 0,
  borderRadius: "0.375rem",
  padding: "0.625rem 1.25rem",
  fontWeight: 500,
  fontSize: "1rem",
  cursor: "pointer",
} as const;

// Nothing to subscribe to: the store only answers "are we in the browser yet".
const subscribeNever = () => () => {};

/**
 * Last-resort boundary: catches a throw in the ROOT layout itself, which
 * neither `error.tsx` can — they render inside the layout that failed.
 * It replaces the root layout, so it must supply its own <html> and <body>.
 *
 * Two constraints here are load-bearing, not style:
 *
 * 1. It imports NOTHING from the app. Whatever failed may be that very code,
 *    and per Next's docs global-error does not receive the app's global
 *    styles anyway.
 * 2. Styling is therefore inline. That is safe only because the CSP (when it
 *    lands) keeps `style-src` as `'self' 'unsafe-inline'` with no nonce — a
 *    nonce-based style-src would silently drop every one of these styles.
 *    The two changes are coupled; if you touch one, check the other.
 * 3. It must work WITHOUT JavaScript (upstream MPNext aa696f8). Next prerenders
 *    this file (`_global-error.html`, which scripts/check-prerender-shells.mjs
 *    allows to stay static because the root layout's connection() opt-out
 *    cannot reach it). A prerender has no request and so no CSP nonce, and the
 *    CSP is enforcing in production, so the static copy's scripts are blocked
 *    and it never hydrates. An error boundary must be a client component, so
 *    it cannot opt out. The primary control is therefore a plain
 *    `<a href="/">` (a full reload, which also re-runs the failed root layout),
 *    and the `retry()` button renders only once hydrated
 *    (`useSyncExternalStore`'s server snapshot is `false`), so the static copy
 *    never shows a button that does nothing.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  useEffect(() => {
    console.error(
      JSON.stringify({
        event: "ui.render.error",
        boundary: "global",
        name: error.name,
        digest: error.digest ?? null,
      })
    );
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fff",
          color: "#111",
        }}
      >
        {/* A client component cannot export `metadata`, so the title is set
            with React's own <title> element. */}
        <title>Something went wrong</title>
        <div style={{ maxWidth: "28rem", padding: "0 1rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#4b5563", marginBottom: "1.5rem" }}>
            The application failed to start. Reloading often clears it.
          </p>
          {error.digest ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              Reference code: <code>{error.digest}</code>
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            {/* A plain link, not <Link>: it is the one control that works on
                the prerendered, nonce-less copy of this page (constraint 3). */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberate: <Link> needs hydration, which the static copy never gets */}
            <a href="/" style={{ ...BUTTON_STYLE, textDecoration: "none" }}>
              Reload the app
            </a>
            {hydrated ? (
              <button
                type="button"
                onClick={retry}
                style={{ ...BUTTON_STYLE, background: "#fff", color: "#344767", border: "1px solid #d1d5db" }}
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
