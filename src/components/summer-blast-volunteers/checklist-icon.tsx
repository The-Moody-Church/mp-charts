"use client";

import React from "react";
import type { SummerBlastItemStatus } from "@/lib/dto";

interface Props {
  status: SummerBlastItemStatus;
}

export function ChecklistStatusIcon({ status }: Props) {
  if (status === "complete") {
    return (
      <svg
        className="h-4 w-4 text-green-600 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === "expired") {
    return (
      <svg
        className="h-4 w-4 text-red-500 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  if (status === "will_expire") {
    // Calendar-clock icon — distinct from the standard "expiring soon" warning triangle.
    return (
      <svg
        className="h-4 w-4 text-amber-600 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 8.25h18M5.25 6h13.5A2.25 2.25 0 0121 8.25v9.75A2.25 2.25 0 0118.75 20.25H5.25A2.25 2.25 0 013 18V8.25A2.25 2.25 0 015.25 6z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 12v3l2 1" />
      </svg>
    );
  }
  if (status === "in_progress") {
    return (
      <svg
        className="h-4 w-4 text-yellow-500 flex-shrink-0 animate-pulse"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }
  // not_started
  return <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />;
}
