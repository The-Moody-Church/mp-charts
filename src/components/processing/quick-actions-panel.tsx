"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_FILE_SIZE } from "@/lib/processing-utils";

interface QuickActionItem {
  key: string;
  label: string;
}

interface QuickActionsPanelProps {
  availableItems: QuickActionItem[];
  selectedKey: string;
  onSelectedKeyChange: (key: string) => void;
  date: string;
  onDateChange: (date: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  fileError: string | null;
  onFileError: (error: string | null) => void;
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
  allCompleteMessage?: string;
}

export function QuickActionsPanel({
  availableItems,
  selectedKey,
  onSelectedKeyChange,
  date,
  onDateChange,
  notes,
  onNotesChange,
  fileInputRef,
  fileError,
  onFileError,
  canSubmit,
  submitting,
  onSubmit,
  allCompleteMessage = "All milestones are complete.",
}: QuickActionsPanelProps) {
  return (
    <div className="space-y-2 pt-2 border-t">
      <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
      <div className="space-y-2">
        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="milestone-notes" className="text-xs">Notes (optional)</Label>
            <Textarea
              id="milestone-notes"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Add notes for the milestone..."
              className="text-xs"
              rows={2}
            />
          </div>
          <div className="w-36">
            <Label htmlFor="milestone-date" className="text-xs">Date</Label>
            <Input
              id="milestone-date"
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="file-upload" className="text-xs">Attachment (optional)</Label>
          <Input
            id="file-upload"
            type="file"
            ref={fileInputRef}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            className="text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && file.size > MAX_FILE_SIZE) {
                onFileError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 1 MB.`);
              } else {
                onFileError(null);
              }
            }}
          />
          {fileError && (
            <p className="text-xs text-red-600 mt-1">{fileError}</p>
          )}
        </div>
        {availableItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {allCompleteMessage}
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="milestone-select" className="text-xs">Milestone</Label>
              <select
                id="milestone-select"
                value={selectedKey}
                onChange={(e) => onSelectedKeyChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a milestone...</option>
                {availableItems.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={!canSubmit || submitting || !!fileError}
            >
              {submitting ? "Saving..." : "Mark Complete"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
