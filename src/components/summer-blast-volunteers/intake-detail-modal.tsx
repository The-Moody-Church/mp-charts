"use client";

import React, { useState } from "react";
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
import { WillExpireInlineBadge } from "./will-expire-badge";
import {
  addToSummerBlast,
  createSummerBlastCpp,
  createSummerBlastMandatedReporter,
} from "./actions";
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
  const [cppDate, setCppDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [mrDate, setMrDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Reset state on open
  React.useEffect(() => {
    if (open) {
      setSelectedRoleId("");
      setError(null);
      setActionLoading(null);
      setCppDate(new Date().toISOString().split("T")[0]);
      setMrDate(new Date().toISOString().split("T")[0]);
    }
  }, [open]);

  if (!card) return null;

  const { info } = card;
  const displayName = getDisplayName(info.First_Name, info.Nickname);

  const cppItem = card.checklist.find((c) => c.type === "form");
  const mrItem = card.checklist.find((c) => c.type === "certification");

  const handleAddCpp = async () => {
    if (!card) return;
    setActionLoading("cpp");
    setError(null);
    try {
      const fd = new FormData();
      fd.set("Contact_ID", String(card.info.Contact_ID));
      fd.set("Response_Date", `${cppDate}T12:00:00`);
      const result = await createSummerBlastCpp(fd);
      if (!result.success) {
        setError(result.error || "Failed to add CPP");
      } else {
        onUpdate();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddMr = async () => {
    if (!card) return;
    setActionLoading("mr");
    setError(null);
    try {
      const fd = new FormData();
      fd.set("Participant_ID", String(card.info.Participant_ID));
      fd.set("Certification_Completed", `${mrDate}T12:00:00`);
      const result = await createSummerBlastMandatedReporter(fd);
      if (!result.success) {
        setError(result.error || "Failed to add Mandated Reporter");
      } else {
        onUpdate();
      }
    } finally {
      setActionLoading(null);
    }
  };

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

        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-md p-2">{error}</div>
        )}

        {/* Requirements snapshot */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Requirements</h3>
          <div className="space-y-1">
            {card.checklist.map((item) => (
              <ChecklistRow key={item.key} item={item} />
            ))}
          </div>
        </div>

        {/* Add CPP */}
        <div className="rounded-md border bg-gray-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Add CPP (Child Protection Policy)</h4>
            {cppItem?.status === "complete" && (
              <span className="text-xs text-green-700">Current</span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <Label htmlFor="cpp-date" className="text-xs">
                Response Date
              </Label>
              <input
                id="cpp-date"
                type="date"
                value={cppDate}
                onChange={(e) => setCppDate(e.target.value)}
                className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <Button
              size="sm"
              onClick={handleAddCpp}
              disabled={actionLoading !== null}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {actionLoading === "cpp" ? "Saving..." : "Add CPP"}
            </Button>
          </div>
        </div>

        {/* Add Mandated Reporter */}
        <div className="rounded-md border bg-gray-50 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Add Mandated Reporter Certification</h4>
            {mrItem?.status === "complete" && (
              <span className="text-xs text-green-700">Current</span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <Label htmlFor="mr-date" className="text-xs">
                Completion Date
              </Label>
              <input
                id="mr-date"
                type="date"
                value={mrDate}
                onChange={(e) => setMrDate(e.target.value)}
                className="mt-1 w-full rounded-md border bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <Button
              size="sm"
              onClick={handleAddMr}
              disabled={actionLoading !== null}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {actionLoading === "mr" ? "Saving..." : "Add Mandated Reporter"}
            </Button>
          </div>
        </div>

        {/* Add to SB */}
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
          <h4 className="text-sm font-semibold">Add to SB Spreadsheet</h4>
          <p className="text-xs text-blue-900">
            Creates a Group Participant in the Summer Blast Volunteers group and closes
            this Opportunity Response.
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
      {item.expires && (
        <span className="ml-auto text-[11px] text-muted-foreground">
          Expires {formatDate(item.expires)}
        </span>
      )}
    </div>
  );
}
