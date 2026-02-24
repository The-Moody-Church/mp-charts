"use client";

import React from "react";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { BaptismCard as BaptismCardData, BaptismChecklistItem } from "@/lib/dto";
import { useRuntimeConfig } from "@/contexts";

interface BaptismCardProps {
  applicant: BaptismCardData;
  onClick: () => void;
}

function getDisplayName(firstName: string, nickname: string | null): string {
  return nickname && nickname.trim() ? nickname : firstName;
}

function getInitials(firstName: string, nickname: string | null, lastName: string): string {
  const displayFirst = getDisplayName(firstName, nickname);
  const first = displayFirst?.charAt(0)?.toUpperCase() || "";
  const last = lastName?.charAt(0)?.toUpperCase() || "";
  return first + last;
}

function getImageUrl(baseUrl: string, imageGuid: string): string {
  return `${baseUrl}/${imageGuid}?$thumbnail=true`;
}

function StatusIcon({ item }: { item: BaptismChecklistItem }) {
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

function formatEndDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BaptismCard({ applicant, onClick }: BaptismCardProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const { info, checklist, completedCount, totalCount, isPaused, isFullyComplete, endDate } = applicant;
  const displayName = getDisplayName(info.First_Name, info.Nickname);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow py-4 gap-3 relative"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center px-3">
        {/* Status badges (top-right) */}
        {(isFullyComplete || isPaused || endDate) && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            {isFullyComplete && (
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
                title={`End Date: ${formatEndDate(endDate)}`}
              >
                Ends {formatEndDate(endDate)}
              </span>
            )}
          </div>
        )}

        {/* Photo */}
        <div className="w-16 h-16 rounded-full overflow-hidden relative flex-shrink-0 mb-2">
          {info.Image_GUID && mpFileUrl ? (
            <Image
              src={getImageUrl(mpFileUrl, info.Image_GUID)}
              alt={`${displayName} ${info.Last_Name}`}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full bg-gray-300 rounded-full flex items-center justify-center text-gray-600 text-lg font-medium">
              {getInitials(info.First_Name, info.Nickname, info.Last_Name)}
            </div>
          )}
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
