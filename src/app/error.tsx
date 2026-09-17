"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Error boundary for the ROOT segment — the routes that sit outside the
 * `(web)` group and therefore have no app shell: /signin, /session-error and
 * /auth-error.
 *
 * Why this is separate from `(web)/error.tsx`: `error.tsx` never wraps the
 * layout of its OWN segment, so one boundary cannot cover both. If the root
 * boundary were the only one, a throw on any `(web)` page would replace the
 * whole shell — taking the header and the user's sign-out control with it.
 * That is exactly the trap /session-error exists to avoid.
 *
 * Deliberately plain markup, not the shared UI components: this renders when
 * something below has already failed, so it should depend on as little as
 * possible.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16 passes `retry`, which re-fetches and re-renders the segment.
  // `reset` still exists but only clears error state without re-fetching — a
  // boundary wired to it renders fine and its button silently does less than
  // it appears to.
  retry: () => void;
}) {
  useEffect(() => {
    // Identifiers only, never `error.message`. This boundary sits above
    // components that render member names and pastoral notes, and unlike a
    // controlled catch around an HTTP call, a render error's message is not
    // guaranteed to be content-free. `digest` is the join key to the
    // un-redacted server-side log.
    console.error(
      JSON.stringify({
        event: "ui.render.error",
        boundary: "root",
        name: error.name,
        digest: error.digest ?? null,
      })
    );
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-3">Something went wrong</h1>
        <p className="text-gray-600 mb-6">
          An unexpected error occurred. Trying again often clears it.
        </p>
        {error.digest ? (
          <p className="text-gray-500 text-sm mb-6">
            Reference code: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center justify-center rounded-md bg-[#344767] px-5 py-2.5 text-white font-medium hover:bg-[#2d3a5f] focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border px-5 py-2.5 font-medium hover:bg-gray-50"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
