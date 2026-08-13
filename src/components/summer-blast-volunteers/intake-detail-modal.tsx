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
import { Label } from "@/components/ui/label";
import { PersonAvatar, ContactLinks } from "@/components/processing";
import { useRuntimeConfig } from "@/contexts";
import { getDisplayName, formatDate } from "@/lib/processing-utils";
import { ChecklistStatusIcon } from "./checklist-icon";
import { PreviouslyExpiredInlineBadge, WillExpireInlineBadge } from "./will-expire-badge";
import { addToSummerBlast } from "./actions";
import type {
  SummerBlastIntakeCard,
  SummerBlastChecklistItem,
} from "@/lib/dto";

interface Props {
  card: SummerBlastIntakeCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
  roleOptions: { groupRoleId: number; label: string }[];
  tempGroupRoleId: number;
  cutoffDateLabel?: string;
}

export function IntakeDetailModal({
  card,
  open,
  onOpenChange,
  onUpdate,
  roleOptions,
  tempGroupRoleId,
  cutoffDateLabel,
}: Props) {
  const { mpFileUrl } = useRuntimeConfig();
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!card) return null;

  const { info } = card;
  const displayName = getDisplayName(info.First_Name, info.Nickname);

  const handleAddToSb = async () => {
    if (!card) return;
    setActionLoading("add");
    setError(null);
    try {
      const fd = new FormData();
      fd.set("Contact_ID", String(card.info.Contact_ID));
      fd.set("Response_ID", String(card.responseId));
      if (selectedRoleId) fd.set("Group_Role_ID", selectedRoleId);
      const result = await addToSummerBlast(fd);
      if (!result.success) {
        setError(result.error || "Failed to add to Summer Blast");
      } else {
        onUpdate();
        onOpenChange(false);
      }
    } finally {
      setActionLoading(null);
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
                Responded {formatDate(card.responseDate)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ContactLinks
          email={info.Email_Address}
          phone={info.Mobile_Phone}
          contactId={info.Contact_ID}
        />

        {card.comments && card.comments.trim() && (
          <div className="rounded-md border bg-gray-50 p-3 space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Signup Comments
            </h4>
            <p className="text-sm whitespace-pre-wrap break-words">{card.comments}</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-md p-2">{error}</div>
        )}

        {/* Requirements snapshot — display only */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Requirements</h3>
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

        {/* Add to SB */}
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
          <h4 className="text-sm font-semibold">Add to SB Spreadsheet</h4>
          <p className="text-xs text-blue-900">
            Creates a Group Participant in the Summer Blast Volunteers group, closes this
            Opportunity Response, and copies the signup comments into the participant&apos;s
            notes.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="sb-role" className="text-xs">
                Group Role (optional — defaults to Temp)
              </Label>
              <select
                id="sb-role"
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Temp (reassign later)</option>
                {roleOptions.map((r) => (
                  <option key={r.groupRoleId} value={r.groupRoleId}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              onClick={handleAddToSb}
              disabled={actionLoading !== null}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {actionLoading === "add"
                ? "Adding..."
                : `Added to SB Spreadsheet${
                    !selectedRoleId ? ` (role ${tempGroupRoleId})` : ""
                  }`}
            </Button>
          </div>
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
