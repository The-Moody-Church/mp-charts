"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { VolunteerCard as VolunteerCardData, ChecklistItemStatus } from "@/lib/dto";
import { getDisplayName } from "@/lib/processing-utils";
import { PersonAvatar } from "@/components/processing";
import { useRuntimeConfig } from "@/contexts";

interface VolunteerCardProps {
  volunteer: VolunteerCardData;
  onClick: () => void;
}

function StatusIcon({ item }: { item: ChecklistItemStatus }) {
  switch (item.status) {
    case "complete":
      return (
        <svg className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case "in_progress":
      return (
        <svg className="h-4 w-4 text-yellow-500 flex-shrink-0 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "expiring_soon":
      return (
        <svg className="h-4 w-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      );
    case "expired":
      return (
        <svg className="h-4 w-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case "presumed_complete":
      return (
        <svg className="h-4 w-4 text-yellow-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 8h1.5v5h-1.5zM11 15h1.5v1.5h-1.5z" />
        </svg>
      );
    default:
      return (
        <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
      );
  }
}

export function VolunteerCard({ volunteer, onClick }: VolunteerCardProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const { info, checklist, completedCount, totalCount, fullyApproved, elderApprovedTeacher, groupNames } = volunteer;
  const displayName = getDisplayName(info.First_Name, info.Nickname);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow py-4 gap-3 relative"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center px-3">
        {/* Status icons (top-right) */}
        {(fullyApproved || elderApprovedTeacher) && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            {elderApprovedTeacher && (
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z" />
              </svg>
            )}
            {fullyApproved && (
              <svg className="h-5 w-5 text-yellow-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
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

        {/* Group names */}
        {groupNames.length > 0 && (
          <div className="w-full mb-2 flex flex-wrap gap-1 justify-center">
            {groupNames.map((name) => (
              <span
                key={name}
                className="inline-block text-[10px] leading-tight bg-muted text-muted-foreground rounded px-1.5 py-0.5 truncate max-w-full"
                title={name}
              >
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Checklist */}
        <div className="w-full space-y-1">
          {checklist.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <StatusIcon item={item} />
              <span className={`text-xs truncate ${
                item.status === "expired" ? "text-red-600 line-through" :
                item.status === "expiring_soon" ? "text-orange-600" :
                item.status === "complete" ? "text-gray-700" :
                item.status === "in_progress" ? "text-yellow-700" :
                item.status === "presumed_complete" ? "text-yellow-600" :
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
