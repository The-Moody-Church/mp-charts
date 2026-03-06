"use client";

import { UserProvider } from "@/contexts/user-context";
import { RuntimeConfigProvider, type RuntimeConfig } from "@/contexts/runtime-config-context";
import { ReactNode, useEffect } from "react";

interface ProvidersProps {
  runtimeConfig: RuntimeConfig;
  children: ReactNode;
}

export function Providers({ runtimeConfig, children }: ProvidersProps) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js");
    }
  }, []);

  return (
    <RuntimeConfigProvider config={runtimeConfig}>
      <UserProvider>
        {children}
      </UserProvider>
    </RuntimeConfigProvider>
  );
}
