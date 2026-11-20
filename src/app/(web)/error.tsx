"use client";

import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { handleSignOut } from "@/components/user-menu/actions";
import Link from "next/link";

/**
 * Sign-out from the error page (upstream MPNext f3cb739, adapted). When this
 * boundary renders, the header's user menu may be gone with the rest of the
 * page, and a staff member on a shared PC must still be able to leave. It calls
 * the same server action as the user menu; `handleSignOut` keeps its
 * `redirect()` outside any catch, so nothing here needs to rethrow it.
 * Upstream also added sign-out to the ROOT error boundary; ours covers only
 * /signin, /auth-error and /session-error, which have no session to end.
 */
function SignOutButton() {
  return (
    <Button variant="outline" className="mt-4" onClick={() => handleSignOut()}>
      Sign out
    </Button>
  );
}

export default function WebError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16 passes `retry`, which re-fetches and re-renders the segment.
  // `reset` still exists but only clears error state without re-fetching, so a
  // boundary wired to it renders fine and its button silently does less.
  retry: () => void;
}) {
  useEffect(() => {
    // Identifiers only, never `error.message`. This boundary sits above
    // components that render member names and pastoral notes, and a render
    // error's message is not guaranteed to be content-free. `digest` joins to
    // the un-redacted server log.
    console.error(
      JSON.stringify({
        event: "ui.render.error",
        boundary: "web",
        name: error.name,
        digest: error.digest ?? null,
      })
    );
  }, [error]);

  // NOTE on this check: Next redacts a SERVER COMPONENT error's message in
  // production (replacing it with a generic string plus a digest), so this
  // branch only reliably fires for errors thrown from SERVER ACTIONS, whose
  // messages are preserved. That covers the common case — a gated action
  // refusing — but a gated page render falls through to the generic message
  // below. The durable fix is a layout-level redirect to an explaining page
  // rather than pattern-matching a string here.
  const isForbidden = error.message?.includes("Forbidden") || error.message?.includes("insufficient permissions");

  if (isForbidden) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Alert>
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You don&apos;t have permission to access this feature.
            Contact your administrator if you believe this is an error.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Link href="/">
            <Button className="mt-4">Return Home</Button>
          </Link>
          <SignOutButton />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Alert variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          {"An unexpected error occurred. Please try again."}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button onClick={retry} className="mt-4">
          Try Again
        </Button>
        <SignOutButton />
      </div>
    </div>
  );
}
