"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MembershipCard as MembershipCardData } from "@/lib/dto";
import { getDisplayName } from "@/lib/processing-utils";
import { PersonAvatar } from "@/components/processing";
import { useRuntimeConfig } from "@/contexts";

interface MembershipCardProps {
  applicant: MembershipCardData;
  onClick: () => void;
}

function StatusIcon({ completed }: { completed: boolean }) {
  if (completed) {
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

export function MembershipCard({ applicant, onClick }: MembershipCardProps) {
  const { mpFileUrl } = useRuntimeConfig();
  const { info, checklist, completedCount, totalCount, isFullyComplete } = applicant;
  const displayName = getDisplayName(info.First_Name, info.Nickname);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow py-4 gap-3 relative"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center px-3">
        {/* Fully complete badge */}
        {isFullyComplete && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">
              Complete
            </span>
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
              <StatusIcon completed={item.completed} />
              <span className={`text-xs truncate ${
                item.completed ? "text-gray-700" : "text-gray-400"
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
