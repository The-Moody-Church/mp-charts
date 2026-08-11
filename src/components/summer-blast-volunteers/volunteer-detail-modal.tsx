"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PersonAvatar, ContactLinks } from "@/components/processing";
import { useRuntimeConfig } from "@/contexts";
import { getDisplayName, formatDate } from "@/lib/processing-utils";
import { ChecklistStatusIcon } from "./checklist-icon";
import { PreviouslyExpiredInlineBadge, WillExpireInlineBadge } from "./will-expire-badge";
import { removeFromSummerBlast } from "./actions";
import type {
  SummerBlastVolunteerCard,
  SummerBlastChecklistItem,
} from "@/lib/dto";

interface Props {
  card: SummerBlastVolunteerCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  cutoffDateLabel?: string;
}

export function VolunteerDetailModal({
  card,
  open,
  onOpenChange,
  onUpdate,
  cutoffDateLabel,
}: Props) {
  const { mpFileUrl } = useRuntimeConfig();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  if (!card) return null;

  const { info } = card;
  const displayName = getDisplayName(info.First_Name, info.Nickname);

  const handleRemove = async () => {
    setActionLoading("remove");
    setError(null);
    try {
      const fd = new FormData();
      fd.set("Group_Participant_ID", String(card.groupParticipantId));
      const result = await removeFromSummerBlast(fd);
      if (!result.success) {
        setError(result.error || "Failed to remove");
      } else {
        onUpdate();
        onOpenChange(false);
      }
    } finally {
      setActionLoading(null);
      setShowRemoveConfirm(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-4">
            <PersonAvatar
              imageGuid={info.Image_GUID}
              mpFileUrl={mpFileUrl}
              firstName={info.First_Name}
              nickname={info.Nickname}
              lastName={info.Last_Name}
            />
            <div>
              <DialogTitle>
                {displayName} {info.Last_Name}
              </DialogTitle>
              <DialogDescription>
                Joined {formatDate(card.startDate)} — {card.groupRoleLabel}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ContactLinks
          email={info.Email_Address}
          phone={info.Mobile_Phone}
          contactId={info.Contact_ID}
        />

        {card.notes && card.notes.trim() && (
          <div className="rounded-md border bg-gray-50 p-3 space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Notes
            </h4>
            <p className="text-sm whitespace-pre-wrap break-words">{card.notes}</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-md p-2">{error}</div>
        )}

        {/* Requirements — display only */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Requirements for {card.groupRoleLabel}</h3>
          <p className="text-[11px] text-muted-foreground">
            CPP and Mandated Reporter records are entered in their own MP forms — this view
            is read-only.
          </p>
          <div className="space-y-1">
            {card.checklist.map((item) => (
              <ChecklistRow key={item.key} item={item} />
            ))}
          </div>
        </div>

        {/* Remove from group */}
        <div className="rounded-md border border-red-200 bg-red-50 p-3 space-y-2">
          <h4 className="text-sm font-semibold text-red-800">Remove from Summer Blast</h4>
          {!showRemoveConfirm ? (
            <Button
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-100"
              onClick={() => setShowRemoveConfirm(true)}
              disabled={actionLoading !== null}
            >
              Remove from Group
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-red-900">
                This will end-date the volunteer&apos;s participation in the Summer Blast
                Volunteers group. Their Opportunity Response will stay closed.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowRemoveConfirm(false)}
                  disabled={actionLoading !== null}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleRemove}
                  disabled={actionLoading !== null}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {actionLoading === "remove" ? "Removing..." : "Confirm Remove"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {cutoffDateLabel && (
          <p className="text-[11px] text-muted-foreground">
            &ldquo;Will Expire&rdquo; means the requirement is currently valid but expires before{" "}
            {cutoffDateLabel}.
          </p>
        )}
      </DialogContent>
    </Dialog>
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
          : "text-gray-500";
  return (
    <div className="flex items-center gap-2 text-sm">
      <ChecklistStatusIcon status={item.status} />
      <span className={textClass}>{item.label}</span>
      {item.status === "will_expire" && <WillExpireInlineBadge />}
      {item.status === "in_progress" && item.previouslyExpired && <PreviouslyExpiredInlineBadge />}
      {item.expires && (
        <span className="ml-auto text-[11px] text-muted-foreground">
          Expires {formatDate(item.expires)}
        </span>
      )}
    </div>
  );
}
