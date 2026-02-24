"use client";

import { useEffect, useRef, Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { useSearchParams } from "next/navigation";

function getSafeCallbackUrl(url: string | null): string {
  if (!url) return "/";
  // Only allow relative URLs — block protocol-relative (//evil.com) and absolute URLs
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("://")) {
    return url;
  }
  return "/";
}

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = getSafeCallbackUrl(searchParams?.get("callbackUrl"));
  const isRedirecting = useRef(false);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (isPending) return;

    if (session) {
      // User is already signed in, redirect to callback URL
      window.location.href = callbackUrl;
    } else if (!isRedirecting.current) {
      // User is not signed in, initiate sign in
      isRedirecting.current = true;
      authClient.signIn.oauth2({
        providerId: "ministryplatform",
        callbackURL: callbackUrl,
      });
    }
  }, [callbackUrl, session, isPending]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4">Redirecting to sign in...</h2>
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mx-auto"></div>
      </div>
    </div>
  );
}

function SignInFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4">Loading...</h2>
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent mx-auto"></div>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInContent />
    </Suspense>
  );
}