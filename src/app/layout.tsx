import { connection } from "next/server";
import "./globals.css";

/**
 * The whole app renders at request time.
 *
 * WHY: a nonce-based Content-Security-Policy and Next's prerendered shells are
 * mutually exclusive. Next reads the nonce off the INCOMING REQUEST at render
 * time, so a shell built at `next build` has no request and its script tags
 * get no nonce. From Next's own CSP guide:
 *
 *   "Partial Prerendering (PPR) is also incompatible with nonce-based CSP
 *    because static shell scripts cannot access the nonce."
 *
 * Measured here before this change: /auth-error served 16 script tags and only
 * 4 carried the nonce. The other 12 came from `auth-error.html`, the build-time
 * shell. Under an enforced policy those 12 are blocked and the page never
 * hydrates. Thirteen of this app's fifteen shells had the same problem.
 *
 * WHY HERE AND NOT PER ROUTE: Next documents `instant = false` on the root
 * layout as covering the entire application. Doing it per route is the same
 * fix applied N times, and every future route would silently reintroduce the
 * bug the day someone forgets. One place, one rule.
 *
 * WHAT IT COSTS: the prerendered shell, so first paint is a server render
 * rather than prebuilt HTML. It does NOT cost data caching — `use cache` and
 * the cache warming in `instrumentation.ts` cache Ministry Platform data, not
 * HTML, and are untouched by this.
 *
 * DO NOT "optimise" this away by removing `connection()`. Without it the
 * shells come back, and the failure is silent: the app still builds, still
 * renders, and only breaks once CSP_ENFORCE is turned on.
 * `src/app/layout.test.tsx` pins both halves.
 */
export const instant = false;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
