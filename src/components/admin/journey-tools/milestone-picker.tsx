"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { JourneyMilestoneConfig } from "@/lib/journey-tools-config-types";

interface MilestonePickerProps {
  milestones: JourneyMilestoneConfig[];
  onChange: (milestones: JourneyMilestoneConfig[]) => void;
}

export function MilestonePicker({ milestones, onChange }: MilestonePickerProps) {
  const sorted = [...milestones].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleToggle = (milestoneId: number, visible: boolean) => {
    onChange(
      milestones.map((m) =>
        m.milestoneId === milestoneId ? { ...m, visible } : m
      )
    );
  };

  const handleLabelChange = (milestoneId: number, label: string) => {
    onChange(
      milestones.map((m) =>
        m.milestoneId === milestoneId ? { ...m, label } : m
      )
    );
  };

  const handleMoveUp = (milestoneId: number) => {
    const idx = sorted.findIndex((m) => m.milestoneId === milestoneId);
    if (idx <= 0) return;
    const newSorted = [...sorted];
    // Swap sort orders
    const temp = newSorted[idx].sortOrder;
    newSorted[idx] = { ...newSorted[idx], sortOrder: newSorted[idx - 1].sortOrder };
    newSorted[idx - 1] = { ...newSorted[idx - 1], sortOrder: temp };
    onChange(newSorted);
  };

  const handleMoveDown = (milestoneId: number) => {
    const idx = sorted.findIndex((m) => m.milestoneId === milestoneId);
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
        <p className="text-sm text-muted-foreground">No milestones available for this journey.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((m, idx) => (
        <div
          key={m.milestoneId}
          className="flex items-center gap-2 rounded-md border p-2"
        >
          <Checkbox
            checked={m.visible}
            onCheckedChange={(checked) => handleToggle(m.milestoneId, checked === true)}
          />
          <Input
            value={m.label}
            onChange={(e) => handleLabelChange(m.milestoneId, e.target.value)}
            className="flex-1 h-8 text-sm text-base sm:text-sm"
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            ID: {m.milestoneId}
          </span>
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              disabled={idx === 0}
              onClick={() => handleMoveUp(m.milestoneId)}
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
              onClick={() => handleMoveDown(m.milestoneId)}
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
