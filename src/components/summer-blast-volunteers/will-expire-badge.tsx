"use client";

import React from "react";

interface WillExpireBadgeProps {
  /** Optional date string formatted like "Jul 31, 2026" — appended to title. */
  cutoffDate?: string;
}

/** Top-right summary badge — distinct from compliance "Expiring" (30-day). */
export function WillExpireBadge({ cutoffDate }: WillExpireBadgeProps) {
  const title = cutoffDate ? `Expires before ${cutoffDate}` : "Expires before event end";
  return (
    <span
      className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-300"
      title={title}
    >
      Will Expire
    </span>
  );
}

/** Per-item indicator: small chip used inline with checklist items. */
export function WillExpireInlineBadge() {
  return (
    <span className="inline-flex items-center rounded-sm bg-amber-50 px-1 py-0 text-[9px] font-medium text-amber-800">
      will expire
    </span>
  );
}
