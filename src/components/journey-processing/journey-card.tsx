"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { JourneyCard as JourneyCardData, JourneyChecklistItem } from "@/lib/dto";
import { getDisplayName, formatDate } from "@/lib/processing-utils";
import { PersonAvatar } from "@/components/processing";
import { useRuntimeConfig } from "@/contexts";

interface JourneyCardProps {
  participant: JourneyCardData;
  onClick: () => void;
}

function StatusIcon({ item }: { item: JourneyChecklistItem }) {
  if (item.status === "complete") {
    return (
      <svg className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
  );
}

export function JourneyCard({ participant, onClick }: JourneyCardProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const { info, checklist, completedCount, totalCount, isPaused, isFullyComplete, isDiscontinued, endDate } = participant;
  const displayName = getDisplayName(info.First_Name, info.Nickname);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow py-4 gap-3"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center px-3">
        {/* Status badges */}
        {(isFullyComplete || isDiscontinued || isPaused || endDate) && (
          <div className="flex flex-wrap justify-end gap-1 mb-1 w-full">
            {isDiscontinued && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                Discontinued
              </span>
            )}
            {isFullyComplete && !isDiscontinued && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                Complete
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
                item.status === "complete" ? "text-gray-700" : "text-gray-400"
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
