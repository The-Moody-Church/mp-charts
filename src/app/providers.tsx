"use client";

import { UserProvider } from "@/contexts/user-context";
import { RuntimeConfigProvider, type RuntimeConfig } from "@/contexts/runtime-config-context";
import { ReactNode } from "react";

interface ProvidersProps {
  runtimeConfig: RuntimeConfig;
  children: ReactNode;
}

export function Providers({ runtimeConfig, children }: ProvidersProps) {
  return (
    <RuntimeConfigProvider config={runtimeConfig}>
      <UserProvider>
        {children}
      </UserProvider>
    </RuntimeConfigProvider>
  );
}
