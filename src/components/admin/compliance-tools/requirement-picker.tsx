"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ComplianceRequirementConfig } from "@/lib/compliance-tools-config-types";

interface RequirementPickerProps {
  requirements: ComplianceRequirementConfig[];
  onChange: (requirements: ComplianceRequirementConfig[]) => void;
}

const TYPE_LABELS: Record<string, string> = {
  background_check: "BG Check",
  certification: "Cert",
  milestone: "Milestone",
  form: "Form",
};

export function RequirementPicker({ requirements, onChange }: RequirementPickerProps) {
  const sorted = [...requirements].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleToggle = (requirementId: number, visible: boolean) => {
    onChange(
      requirements.map((r) =>
        r.requirementId === requirementId ? { ...r, visible } : r
      )
    );
  };

  const handleLabelChange = (requirementId: number, label: string) => {
    onChange(
      requirements.map((r) =>
        r.requirementId === requirementId ? { ...r, label } : r
      )
    );
  };

  const handleMoveUp = (requirementId: number) => {
    const idx = sorted.findIndex((r) => r.requirementId === requirementId);
    if (idx <= 0) return;
    const newSorted = [...sorted];
    const temp = newSorted[idx].sortOrder;
    newSorted[idx] = { ...newSorted[idx], sortOrder: newSorted[idx - 1].sortOrder };
    newSorted[idx - 1] = { ...newSorted[idx - 1], sortOrder: temp };
    onChange(newSorted);
  };

  const handleMoveDown = (requirementId: number) => {
    const idx = sorted.findIndex((r) => r.requirementId === requirementId);
    if (idx >= sorted.length - 1) return;
    const newSorted = [...sorted];
    const temp = newSorted[idx].sortOrder;
    newSorted[idx] = { ...newSorted[idx], sortOrder: newSorted[idx + 1].sortOrder };
    newSorted[idx + 1] = { ...newSorted[idx + 1], sortOrder: temp };
    onChange(newSorted);
  };

  if (sorted.length === 0) {
    return (
      <div className="rounded-md border p-3">
        <p className="text-sm text-muted-foreground">No requirements found for the selected group roles.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((r, idx) => (
        <div
          key={r.requirementId}
          className="flex items-center gap-2 rounded-md border p-2"
        >
          <Checkbox
            checked={r.visible}
            onCheckedChange={(checked) => handleToggle(r.requirementId, checked === true)}
          />
          <Input
            value={r.label}
            onChange={(e) => handleLabelChange(r.requirementId, e.target.value)}
            className="flex-1 h-8 text-sm text-base sm:text-sm"
          />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap">
            {TYPE_LABELS[r.type] || r.type}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            ID: {r.requirementId}
          </span>
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              disabled={idx === 0}
              onClick={() => handleMoveUp(r.requirementId)}
              aria-label="Move up"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              disabled={idx === sorted.length - 1}
              onClick={() => handleMoveDown(r.requirementId)}
              aria-label="Move down"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
