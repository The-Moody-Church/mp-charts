"use client";

import React from "react";
import { SORT_OPTIONS, type ProcessingSortOption } from "@/lib/processing-utils";

interface ProcessingSortSelectProps {
  value: ProcessingSortOption;
  onChange: (value: ProcessingSortOption) => void;
}

export function ProcessingSortSelect({ value, onChange }: ProcessingSortSelectProps) {
  return (
    <div className="relative w-full sm:w-fit">
      <svg
        className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 18m0 0L12 13.5m4.5 4.5V4.5"
        />
      </svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ProcessingSortOption)}
        className="flex h-9 w-full sm:w-fit rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-base sm:text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
