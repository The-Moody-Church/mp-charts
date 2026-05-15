"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PersonAvatar } from "@/components/processing";
import { useRuntimeConfig } from "@/contexts";
import { getDisplayName, formatDate } from "@/lib/processing-utils";
import { ChecklistStatusIcon } from "./checklist-icon";
import { WillExpireBadge, WillExpireInlineBadge } from "./will-expire-badge";
import type { SummerBlastIntakeCard, SummerBlastChecklistItem } from "@/lib/dto";

interface Props {
  card: SummerBlastIntakeCard;
  onClick: () => void;
  cutoffDateLabel?: string;
  selected: boolean;
  onSelectChange: (selected: boolean) => void;
}

function statusBadge(card: SummerBlastIntakeCard): { label: string; className: string } | null {
  const hasMissing = card.checklist.some((c) => c.status === "not_started");
  const hasExpired = card.checklist.some((c) => c.status === "expired");
  if (hasMissing) return { label: "Missing", className: "bg-gray-100 text-gray-600" };
  if (hasExpired) return { label: "Expired", className: "bg-red-100 text-red-700" };
  if (card.hasWillExpire) return null; // WillExpireBadge renders separately
  if (card.isFullyCompliant) return { label: "Compliant", className: "bg-green-100 text-green-700" };
  return null;
}

export function IntakeCard({ card, onClick, cutoffDateLabel, selected, onSelectChange }: Props) {
  const { mpFileUrl } = useRuntimeConfig();
  const displayName = getDisplayName(card.info.First_Name, card.info.Nickname);
  const badge = statusBadge(card);

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow py-4 gap-3 relative ${selected ? "ring-2 ring-emerald-500" : ""}`}
      onClick={onClick}
    >
      <CardContent className="flex flex-col items-center px-3">
        {/* Selection checkbox (top-left) — separate hit target from card click */}
        <div
          className="absolute top-2 left-2 z-20 flex items-center justify-center rounded-md bg-white/80 p-1 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(c) => onSelectChange(c === true)}
            aria-label={`Select ${displayName} ${card.info.Last_Name}`}
          />
        </div>

        {/* Youth pill — shift right when checkbox is shown */}
        {card.age !== null && card.age < 18 && (
          <div className="absolute top-2 left-10 z-10">
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-300">
              Youth
            </span>
          </div>
        )}

        {/* Status badges (top-right) */}
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

        {/* Photo */}
        <div className="mb-2">
          <PersonAvatar
            imageGuid={card.info.Image_GUID}
            mpFileUrl={mpFileUrl}
            firstName={card.info.First_Name}
            nickname={card.info.Nickname}
            lastName={card.info.Last_Name}
          />
        </div>

        {/* Name */}
        <div className="text-sm font-medium text-center truncate w-full">
          {displayName} {card.info.Last_Name}
        </div>

        {card.age !== null && (
          <div className="text-[11px] text-muted-foreground">Age {card.age}</div>
        )}

        {/* Signed-up date */}
        <div className="text-[11px] text-muted-foreground">
          Signed up {formatDate(card.responseDate)}
        </div>

        {/* Progress */}
        <div className="text-xs text-muted-foreground mb-2">
          {card.completedCount}/{card.totalCount} complete
        </div>

        {/* Checklist */}
        <div className="w-full space-y-1">
          {card.checklist.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </div>

        {/* Comments from the signup */}
        {card.comments && card.comments.trim() && (
          <div
            className="w-full mt-2 pt-2 border-t text-[11px] text-gray-700 whitespace-pre-wrap break-words line-clamp-4"
            title={card.comments}
          >
            <span className="font-semibold text-gray-500">Comments: </span>
            {card.comments}
          </div>
        )}
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
