"use client";

import React, { useState } from "react";
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
  /** Hide the notes textarea (e.g., for form responses that have no notes field) */
  showNotes?: boolean;
  /** Label for the select dropdown (default: "Milestone") */
  itemLabel?: string;
  /** Max length for the notes textarea */
  notesMaxLength?: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/** Inline trigger button — place inside a flex row with other action buttons */
export function QuickActionButton({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}) {
  if (!show) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onClick}
      className="gap-1.5"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
      Quick Action
    </Button>
  );
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
  showNotes = true,
  itemLabel = "Milestone",
  notesMaxLength,
  expanded,
  onExpandedChange,
}: QuickActionsPanelProps) {
  const handleClose = () => {
    onExpandedChange(false);
    onSelectedKeyChange("");
    onNotesChange("");
    onFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!expanded || availableItems.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border bg-gray-50/50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Quick Action</h3>
        <button
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Item selector */}
      <div>
        <Label htmlFor="milestone-select" className="text-xs">{itemLabel}</Label>
        <select
          id="milestone-select"
          value={selectedKey}
          onChange={(e) => onSelectedKeyChange(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Select...</option>
          {availableItems.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* Fields shown only after an item is selected */}
      {selectedKey && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            {showNotes && (
              <div className="flex-1">
                <Label htmlFor="milestone-notes" className="text-xs">Notes (optional)</Label>
                <Textarea
                  id="milestone-notes"
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="Add notes..."
                  className="text-xs"
                  rows={2}
                  maxLength={notesMaxLength}
                />
              </div>
            )}
            <div className={showNotes ? "w-full sm:w-36" : "w-full sm:w-48"}>
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
            <Label htmlFor="file-upload" className="text-xs">Attachments (optional, multiple allowed)</Label>
            <Input
              id="file-upload"
              type="file"
              multiple
              ref={fileInputRef}
              accept=".pdf,.txt,.csv,.jpg,.jpeg,.png,.gif,.bmp,.webp"
              className="text-xs"
              onChange={(e) => {
                const tooBig = Array.from(e.target.files ?? []).find((f) => f.size > MAX_FILE_SIZE);
                if (tooBig) {
                  onFileError(`"${tooBig.name}" is too large (${(tooBig.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 20 MB per file.`);
                } else {
                  onFileError(null);
                }
              }}
            />
            {fileError && (
              <p className="text-xs text-red-600 mt-1">{fileError}</p>
            )}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={onSubmit}
              disabled={!canSubmit || submitting || !!fileError}
            >
              {submitting ? "Saving..." : "Mark Complete"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
