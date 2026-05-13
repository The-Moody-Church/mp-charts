"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PersonAvatar } from "@/components/processing";
import { useRuntimeConfig } from "@/contexts";
import { getDisplayName } from "@/lib/processing-utils";
import { ChecklistStatusIcon } from "./checklist-icon";
import { WillExpireBadge, WillExpireInlineBadge } from "./will-expire-badge";
import type { SummerBlastVolunteerCard, SummerBlastChecklistItem } from "@/lib/dto";

interface Props {
  card: SummerBlastVolunteerCard;
  onClick: () => void;
  cutoffDateLabel?: string;
}

function statusBadge(card: SummerBlastVolunteerCard): { label: string; className: string } | null {
  const hasMissing = card.checklist.some((c) => c.status === "not_started");
  const hasExpired = card.checklist.some((c) => c.status === "expired");
  if (hasMissing) return { label: "Missing", className: "bg-gray-100 text-gray-600" };
  if (hasExpired) return { label: "Expired", className: "bg-red-100 text-red-700" };
  if (card.hasWillExpire) return null;
  if (card.isFullyCompliant) return { label: "Compliant", className: "bg-green-100 text-green-700" };
  return null;
}

export function VolunteerCard({ card, onClick, cutoffDateLabel }: Props) {
  const { mpFileUrl } = useRuntimeConfig();
  const displayName = getDisplayName(card.info.First_Name, card.info.Nickname);
  const badge = statusBadge(card);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow py-4 gap-3 relative"
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center px-3">
        <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
          {badge && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
          {card.hasWillExpire && <WillExpireBadge cutoffDate={cutoffDateLabel} />}
        </div>

        <div className="mb-2">
          <PersonAvatar
            imageGuid={card.info.Image_GUID}
            mpFileUrl={mpFileUrl}
            firstName={card.info.First_Name}
            nickname={card.info.Nickname}
            lastName={card.info.Last_Name}
          />
        </div>

        <div className="text-sm font-medium text-center truncate w-full">
          {displayName} {card.info.Last_Name}
        </div>

        <div className="text-xs text-muted-foreground mb-2">
          {card.completedCount}/{card.totalCount} complete
        </div>

        <div className="w-full space-y-1">
          {card.checklist.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </div>

        {/* Role badge */}
        <div className="flex flex-wrap gap-0.5 w-full mt-2 pt-2 border-t">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
            {card.groupRoleLabel}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ChecklistRow({ item }: { item: SummerBlastChecklistItem }) {
  const textClass =
    item.status === "complete"
      ? "text-gray-700"
      : item.status === "expired"
        ? "text-red-500 line-through"
        : item.status === "will_expire"
          ? "text-amber-700"
          : "text-gray-400";
  return (
    <div className="flex items-center gap-1.5">
      <ChecklistStatusIcon status={item.status} />
      <span className={`text-xs truncate ${textClass}`}>{item.label}</span>
      {item.status === "will_expire" && <WillExpireInlineBadge />}
    </div>
  );
}
