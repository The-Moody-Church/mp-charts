import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function AuthWrapper({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/signin");
  }

  // A session without a userGuid is unusable: every MP lookup keys off userGuid,
  // and without it the header avatar/menu never renders — which leaves the user
  // with no way to even sign out (the trap behind the better-auth 1.6 regression;
  // see userAdditionalFields in @/lib/auth). Route these broken sessions to a
  // recovery page that CAN sign them out, rather than rendering a dead app.
  // /session-error lives outside the (web) route group, so it is not wrapped by
  // AuthWrapper and cannot redirect-loop.
  const userGuid = (session.user as { userGuid?: string | null }).userGuid;
  if (!userGuid) {
    redirect("/session-error");
  }

  return <>{children}</>;
}
