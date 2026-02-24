import { auth, type Session } from "@/lib/auth";
import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Gets the current authenticated session from Better Auth.
 * Returns null if not authenticated.
 */
export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Gets the current authenticated session, throwing if not authenticated.
 * Enforces a general rate limit (120 req/min per user) on every call.
 * Use this in server actions that require authentication.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session?.user) {
    throw new Error("Authentication required");
  }

  // Enforce general rate limit per authenticated user
  const result = checkRateLimit(session.user.id, "general");
  if (!result.allowed) {
    const seconds = Math.ceil(result.retryAfterMs / 1000);
    throw new Error(`Rate limit exceeded. Try again in ${seconds} seconds.`);
  }

  return session;
}

/**
 * Extracts the MP User_ID from a session for audit logging.
 * This is the value passed as $userId to MP API write operations.
 */
export function getMpUserId(session: Session): number | undefined {
  return (session.user as Record<string, unknown>).mpUserId as number | undefined;
}

/**
 * Extracts the MP User_GUID from a session.
 */
export function getUserGuid(session: Session): string | undefined {
  return (session.user as Record<string, unknown>).userGuid as string | undefined;
}
