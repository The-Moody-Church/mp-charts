import { handleSignOut } from "@/components/user-menu/actions";

/**
 * Recovery page for authenticated-but-unusable sessions.
 *
 * `AuthWrapper` redirects here when a session exists but has no `userGuid`
 * (the MP User_GUID). Such a session can't load an MP profile, so the header
 * avatar/menu — and therefore the normal sign-out control — never render.
 * This page gives the user an unconditional way out via `handleSignOut`.
 *
 * It lives outside the (web) route group, so it is NOT wrapped by AuthWrapper
 * and cannot cause a redirect loop.
 */
export default function SessionErrorPage() {
  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-3">We couldn&apos;t load your account</h1>
        <p className="text-gray-600 mb-6">
          Your sign-in completed, but it didn&apos;t include the Ministry Platform
          user link we need to load your profile. Please sign out and sign in
          again. If this keeps happening, contact your administrator.
        </p>
        <form action={handleSignOut}>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-[#344767] px-5 py-2.5 text-white font-medium hover:bg-[#2d3a5f] focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            Sign out and try again
          </button>
        </form>
      </div>
    </div>
  );
}
