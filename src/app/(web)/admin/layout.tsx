import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireFeatureAccess } from "@/lib/authorization";

/**
 * Server-side access gate for the entire /admin subtree (F11).
 *
 * The proxy only checks for the *presence* of a session cookie, and while every
 * admin server action already enforces `requireFeatureAccess("admin")`, the admin
 * UI shell itself rendered for any authenticated user. This layout enforces admin
 * access before the page renders and redirects non-admins home, so page access —
 * not just actions — is gated. Admin status is derived server-side from MP User
 * Groups, so it cannot be spoofed by the client.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Defer to request time — requireFeatureAccess reads headers() and queries MP,
  // so this segment must not be statically prerendered (Cache Components / PPR).
  await connection();

  let allowed = false;
  try {
    await requireFeatureAccess("admin");
    allowed = true;
  } catch {
    // Unauthenticated or non-admin — fall through to redirect. (Keep redirect()
    // OUT of the try/catch: it signals via a thrown control-flow error.)
    allowed = false;
  }

  if (!allowed) redirect("/");

  return <>{children}</>;
}
