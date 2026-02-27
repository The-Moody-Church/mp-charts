"use client";

import { useCallback } from "react";
import { useUser } from "@/contexts";
import type { Feature } from "@/lib/authorization";

export function useAuthorization() {
  const { accessibleFeatures, isSuperAdmin } = useUser();

  const canAccess = useCallback(
    (feature: Feature) => accessibleFeatures.includes(feature),
    [accessibleFeatures]
  );

  return { canAccess, isSuperAdmin };
}
