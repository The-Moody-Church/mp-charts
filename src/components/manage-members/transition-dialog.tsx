"use client";

import { useState, useRef, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_TO_MILESTONE } from "@/lib/dto";
import { transitionMember } from "./actions";
import type { MemberCard } from "@/lib/dto";

interface TransitionDialogProps {
  member: MemberCard | null;
  memberStatuses: { Member_Status_ID: number; Member_Status: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (newStatusId: number) => void;
}

/** Map milestone IDs to display labels */
const MILESTONE_LABELS: Record<number, string> = {
  48: "Registered Member",
  51: "Associate Membership",
  52: "Youth Membership",
  49: "Dropped Membership",
};

export function TransitionDialog({
  member,
  memberStatuses,
  open,
  onOpenChange,
  onSuccess,
}: TransitionDialogProps) {
  const [newStatusId, setNewStatusId] = useState<string>("");
  const [milestoneDate, setMilestoneDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available target statuses: everything except current
  const availableStatuses = memberStatuses.filter(
    (s) => s.Member_Status_ID !== member?.memberStatusId,
  );

  const selectedStatusId = newStatusId ? Number(newStatusId) : null;
  const milestoneId = selectedStatusId ? STATUS_TO_MILESTONE[selectedStatusId] : null;
  const milestoneName = milestoneId ? MILESTONE_LABELS[milestoneId] : null;

  function handleSubmit() {
    if (!member || !selectedStatusId) return;
    setError(null);

    const formData = new FormData();
    formData.set("contactId", String(member.contactId));
    formData.set("participantId", String(member.participantId));
    formData.set("newStatusId", String(selectedStatusId));
    formData.set("milestoneDate", milestoneDate);
    formData.set("notes", notes);

    const file = fileInputRef.current?.files?.[0];
    if (file) {
      formData.set("attachment", file);
    }

    startTransition(async () => {
      const result = await transitionMember(formData);
      if (result.success) {
        // Reset form
        setNewStatusId("");
        setNotes("");
        setMilestoneDate(new Date().toISOString().split("T")[0]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        onOpenChange(false);
        onSuccess(selectedStatusId);
      } else {
        setError(result.error || "An error occurred");
      }
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setNewStatusId("");
      setNotes("");
      setError(null);
      setMilestoneDate(new Date().toISOString().split("T")[0]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change Membership Status</DialogTitle>
          <DialogDescription>
            {member
              ? `Transitioning ${member.displayName} from ${member.memberStatus || "No Status"}`
              : "Select a member"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* New Status */}
          <div className="space-y-2">
            <Label htmlFor="new-status">New Status</Label>
            <Select value={newStatusId} onValueChange={setNewStatusId}>
              <SelectTrigger className="w-full text-base sm:text-sm">
                <SelectValue placeholder="Select new status..." />
              </SelectTrigger>
              <SelectContent>
                {availableStatuses.map((s) => (
                  <SelectItem
                    key={s.Member_Status_ID}
                    value={String(s.Member_Status_ID)}
                  >
                    {s.Member_Status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Milestone indicator */}
          {milestoneName && (
            <div className="space-y-2">
              <Label>Milestone</Label>
              <p className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
                {milestoneName}
              </p>
            </div>
          )}

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="milestone-date">Milestone Date</Label>
            <Input
              id="milestone-date"
              type="date"
              value={milestoneDate}
              onChange={(e) => setMilestoneDate(e.target.value)}
              className="text-base sm:text-sm"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">
              Notes{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                selectedStatusId && selectedStatusId >= 5 && selectedStatusId <= 9
                  ? "Additional notes (status name will be auto-prefixed)..."
                  : "Optional notes..."
              }
              rows={3}
            />
          </div>

          {/* File attachment */}
          <div className="space-y-2">
            <Label htmlFor="attachment">
              Attachment{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="attachment"
              type="file"
              ref={fileInputRef}
              accept=".pdf,.txt,.csv,.jpg,.jpeg,.png,.gif,.bmp,.webp"
              className="text-base sm:text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Max 20 MB. Accepted: JPEG, PNG, GIF, BMP, WebP, PDF, TXT, CSV
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !selectedStatusId}
          >
            {isPending ? "Saving..." : "Save Transition"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
