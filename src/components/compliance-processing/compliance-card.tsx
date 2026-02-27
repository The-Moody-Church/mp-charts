"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ComplianceCard as ComplianceCardData, ComplianceChecklistItem } from "@/lib/dto";
import { getDisplayName, formatDate } from "@/lib/processing-utils";
import { PersonAvatar } from "@/components/processing";
import { useRuntimeConfig } from "@/contexts";

interface ComplianceCardProps {
  participant: ComplianceCardData;
  onClick: () => void;
}

function StatusIcon({ item }: { item: ComplianceChecklistItem }) {
  if (item.status === "complete") {
    return (
      <svg className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (item.status === "expired") {
    return (
      <svg className="h-4 w-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  if (item.status === "expiring_soon") {
    return (
      <svg className="h-4 w-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }
  if (item.status === "in_progress") {
    return (
      <svg className="h-4 w-4 text-yellow-500 flex-shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
  );
}

export function ComplianceCard({ participant, onClick }: ComplianceCardProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const { info, checklist, completedCount, totalCount, isFullyCompliant, isPaused, endDate } = participant;
  const displayName = getDisplayName(info.First_Name, info.Nickname);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow py-4 gap-3 relative"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center px-3">
        {/* Status badges (top-right) */}
        {(isFullyCompliant || isPaused || endDate) && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            {isFullyCompliant && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                Compliant
              </span>
            )}
            {isPaused && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                Paused
              </span>
            )}
            {endDate && (
              <span
                className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700"
                title={`End Date: ${formatDate(endDate)}`}
              >
                Ends {formatDate(endDate)}
              </span>
            )}
          </div>
        )}

        {/* Photo */}
        <div className="mb-2">
          <PersonAvatar
            imageGuid={info.Image_GUID}
            mpFileUrl={mpFileUrl}
            firstName={info.First_Name}
            nickname={info.Nickname}
            lastName={info.Last_Name}
          />
        </div>

        {/* Name */}
        <div className="text-sm font-medium text-center truncate w-full">
          {displayName} {info.Last_Name}
        </div>

        {/* Progress indicator */}
        <div className="text-xs text-muted-foreground mb-2">
          {completedCount}/{totalCount} complete
        </div>

        {/* Checklist */}
        <div className="w-full space-y-1">
          {checklist.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <StatusIcon item={item} />
              <span className={`text-xs truncate ${
                item.status === "complete" ? "text-gray-700" :
                item.status === "expired" ? "text-red-500 line-through" :
                item.status === "expiring_soon" ? "text-orange-600" :
                "text-gray-400"
              }`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
