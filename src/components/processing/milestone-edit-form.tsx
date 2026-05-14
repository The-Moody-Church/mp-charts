"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BaseFileInfo } from "@/lib/dto";

interface MilestoneEditFormProps {
  editDate: string;
  onEditDateChange: (date: string) => void;
  editNotes: string;
  onEditNotesChange: (notes: string) => void;
  editFileInputRef: React.RefObject<HTMLInputElement | null>;
  existingFiles?: BaseFileInfo[];
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  hideNotes?: boolean;
}

export function MilestoneEditForm({
  editDate,
  onEditDateChange,
  editNotes,
  onEditNotesChange,
  editFileInputRef,
  existingFiles,
  error,
  saving,
  onSave,
  onCancel,
  hideNotes,
}: MilestoneEditFormProps) {
  return (
    <div className="px-3 pb-3 border-t bg-blue-50/50 space-y-2">
      <div className="pt-2 flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1">
          <Label className="text-xs">Date</Label>
          <Input
            type="date"
            value={editDate}
            onChange={(e) => onEditDateChange(e.target.value)}
            className="text-xs h-8"
          />
        </div>
        {!hideNotes && (
          <div className="flex-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={editNotes}
              onChange={(e) => onEditNotesChange(e.target.value)}
              className="text-xs"
              rows={2}
            />
          </div>
        )}
      </div>
      <div>
        <Label className="text-xs">Add Files (multiple allowed)</Label>
        <Input
          type="file"
          multiple
          ref={editFileInputRef}
          accept=".pdf,.txt,.csv,.jpg,.jpeg,.png,.gif,.bmp,.webp"
          className="text-xs h-8"
        />
      </div>
      {existingFiles && existingFiles.length > 0 && (
        <div className="pt-1">
          <p className="text-xs font-medium text-gray-700 mb-1">Existing Attachments</p>
          <div className="space-y-1">
            {existingFiles.map((file) => (
              <a
                key={file.fileId}
                href={file.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline block truncate"
              >
                {file.fileName}
              </a>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" onClick={onSave} disabled={saving} className="text-xs h-7 px-3">
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving} className="text-xs h-7 px-3">
          Cancel
        </Button>
      </div>
    </div>
  );
}
