"use client";

import { useEffect, useState, Suspense } from "react";
import { signIn, getSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/";
  const [isRedirecting, setIsRedirecting] = useState(false);

  console.log("SignIn Page rendered with callbackUrl:", callbackUrl);
  
  useEffect(() => {
    // Check if user is already signed in
    getSession().then((session) => {
      if (session) {
        // User is already signed in, redirect to callback URL
        console.log("User is already signed in, redirecting to callback URL:", callbackUrl);
        window.location.href = callbackUrl;
      } else if (!isRedirecting) {
        // User is not signed in, initiate sign in
        console.log("Redirecting to SignIn API");
        setIsRedirecting(true);
        signIn("ministryplatform", { callbackUrl });
      }
    });
  }, [callbackUrl, isRedirecting]);

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