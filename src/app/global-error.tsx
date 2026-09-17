"use client";

import { useEffect } from "react";

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
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
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
            The application failed to start. Trying again often clears it.
          </p>
          {error.digest ? (
            <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
              Reference code: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={retry}
            style={{
              background: "#344767",
              color: "#fff",
              border: 0,
              borderRadius: "0.375rem",
              padding: "0.625rem 1.25rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
