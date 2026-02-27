"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { MilestonePicker } from "./milestone-picker";
import {
  getAvailableJourneys,
  getJourneyMilestones,
  getAvailablePrograms,
  getAvailableGroups,
  getAvailableGroupRoles,
  saveJourneyToolAction,
  type MPJourney,
  type MPProgram,
  type MPGroup,
  type MPGroupRole,
} from "./actions";
import { generateUniqueSlug, type JourneyToolConfig, type JourneyMilestoneConfig } from "@/lib/journey-tools-config-types";

interface JourneyToolEditorProps {
  existingTool?: JourneyToolConfig | null;
  existingSlugs: string[];
  onSaved: () => void;
  onCancel: () => void;
}

export function JourneyToolEditor({ existingTool, existingSlugs, onSaved, onCancel }: JourneyToolEditorProps) {
  const isEditing = !!existingTool;

  // MP reference data
  const [journeys, setJourneys] = useState<MPJourney[]>([]);
  const [programs, setPrograms] = useState<MPProgram[]>([]);
  const [groups, setGroups] = useState<MPGroup[]>([]);
  const [groupRoles, setGroupRoles] = useState<MPGroupRole[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [groupSearch, setGroupSearch] = useState("");

  // Form state
  const [selectedJourneyId, setSelectedJourneyId] = useState<number | null>(existingTool?.journeyId ?? null);
  const [slug, setSlug] = useState(existingTool?.slug ?? "");
  const [journeyName, setJourneyName] = useState(existingTool?.journeyName ?? "");
  const [description, setDescription] = useState(existingTool?.description ?? "");
  const [enabled, setEnabled] = useState(existingTool?.enabled ?? true);
  const [milestones, setMilestones] = useState<JourneyMilestoneConfig[]>(existingTool?.milestones ?? []);
  const [programId, setProgramId] = useState<number | null>(existingTool?.programId ?? null);
  const [trackingGroupId, setTrackingGroupId] = useState<number | null>(existingTool?.trackingGroupId ?? null);
  const [pausedGroupId, setPausedGroupId] = useState<number | null>(existingTool?.pausedGroupId ?? null);
  const [defaultGroupRoleId, setDefaultGroupRoleId] = useState<number | null>(existingTool?.defaultGroupRoleId ?? null);
  const [supportsPause, setSupportsPause] = useState(existingTool?.supportsPause ?? false);
  const [pauseMilestoneId, setPauseMilestoneId] = useState<number | null>(existingTool?.pauseMilestoneId ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMilestones, setLoadingMilestones] = useState(false);

  // Load reference data
  useEffect(() => {
    async function load() {
      try {
        const [j, p, g, gr] = await Promise.all([
          getAvailableJourneys(),
          getAvailablePrograms(),
          getAvailableGroups(),
          getAvailableGroupRoles(),
        ]);
        setJourneys(j);
        setPrograms(p);
        setGroups(g);
        setGroupRoles(gr);
      } catch (err) {
        console.error("Failed to load reference data:", err);
        setError("Failed to load configuration data from Ministry Platform.");
      } finally {
        setLoadingRef(false);
      }
    }
    load();
  }, []);

  // When journey selection changes, fetch milestones
  useEffect(() => {
    if (!selectedJourneyId) return;

    // Don't reload if we're editing and haven't changed the journey
    if (isEditing && selectedJourneyId === existingTool?.journeyId && milestones.length > 0) return;

    setLoadingMilestones(true);
    getJourneyMilestones(selectedJourneyId)
      .then((mpMilestones) => {
        const newMilestones: JourneyMilestoneConfig[] = mpMilestones.map((m, idx) => ({
          milestoneId: m.Milestone_ID,
          label: m.Milestone_Title,
          sortOrder: m.Sort_Order ?? idx + 1,
          visible: true,
        }));
        setMilestones(newMilestones);
      })
      .catch((err) => console.error("Failed to load milestones:", err))
      .finally(() => setLoadingMilestones(false));
  }, [selectedJourneyId, isEditing, existingTool?.journeyId, milestones.length]);

  // Auto-generate slug and name from journey selection
  const handleJourneySelect = (journeyId: number) => {
    setSelectedJourneyId(journeyId);
    const journey = journeys.find((j) => j.Journey_ID === journeyId);
    if (journey && !isEditing) {
      setJourneyName(journey.Journey_Name);
      setDescription(journey.Description || "");
      setSlug(generateUniqueSlug(journey.Journey_Name, existingSlugs));
    }
  };

  // Search groups
  const handleGroupSearch = async () => {
    try {
      const results = await getAvailableGroups(groupSearch);
      setGroups(results);
    } catch (err) {
      console.error("Failed to search groups:", err);
    }
  };

  const handleSave = async () => {
    setError(null);

    if (!selectedJourneyId) {
      setError("Please select a journey.");
      return;
    }
    if (!slug.trim()) {
      setError("Slug is required.");
      return;
    }
    if (!journeyName.trim()) {
      setError("Name is required.");
      return;
    }
    if (milestones.filter((m) => m.visible).length === 0) {
      setError("At least one milestone must be visible.");
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const tool: JourneyToolConfig = {
        slug,
        journeyId: selectedJourneyId,
        journeyName: journeyName.trim(),
        description: description.trim(),
        enabled,
        milestones,
        programId,
        trackingGroupId,
        pausedGroupId,
        defaultGroupRoleId,
        supportsPause,
        pauseMilestoneId: supportsPause ? pauseMilestoneId : null,
        createdAt: existingTool?.createdAt ?? now,
        updatedAt: now,
      };

      const result = await saveJourneyToolAction(tool);
      if (!result.success) {
        setError(result.error || "Failed to save.");
        return;
      }
      onSaved();
    } catch (err) {
      console.error("Save failed:", err);
      setError("Failed to save journey tool.");
    } finally {
      setSaving(false);
    }
  };

  if (loadingRef) {
    return <div className="text-sm text-muted-foreground">Loading configuration data...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Journey Tool" : "Add Journey Tool"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 rounded-md p-2">{error}</div>
        )}

        {/* Journey Selection */}
        <div className="space-y-2">
          <Label htmlFor="journey-select">Journey</Label>
          <select
            id="journey-select"
            value={selectedJourneyId ?? ""}
            onChange={(e) => handleJourneySelect(Number(e.target.value))}
            disabled={isEditing}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
          >
            <option value="">Select a journey...</option>
            {journeys.map((j) => (
              <option key={j.Journey_ID} value={j.Journey_ID}>
                {j.Journey_Name} (ID: {j.Journey_ID})
              </option>
            ))}
          </select>
        </div>

        {/* Name and Slug */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="journey-name">Display Name</Label>
            <Input
              id="journey-name"
              value={journeyName}
              onChange={(e) => setJourneyName(e.target.value)}
              placeholder="e.g., Baptism Processing"
              className="text-base sm:text-sm"
            />
          </div>
          <div className="w-full sm:w-48 space-y-2">
            <Label htmlFor="journey-slug">URL Slug</Label>
            <Input
              id="journey-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g., baptism"
              disabled={isEditing}
              className="text-base sm:text-sm"
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="journey-desc">Description</Label>
          <Textarea
            id="journey-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Short description shown on the home page card"
            className="text-sm"
          />
        </div>

        {/* Program */}
        <div className="space-y-2">
          <Label htmlFor="program-select">Program (for milestone writes)</Label>
          <select
            id="program-select"
            value={programId ?? ""}
            onChange={(e) => setProgramId(e.target.value ? Number(e.target.value) : null)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
          >
            <option value="">None</option>
            {programs.map((p) => (
              <option key={p.Program_ID} value={p.Program_ID}>
                {p.Program_Name} (ID: {p.Program_ID})
              </option>
            ))}
          </select>
        </div>

        {/* Tracking Group */}
        <div className="space-y-2">
          <Label>Tracking Group (filter participants by group membership)</Label>
          <div className="flex gap-2">
            <Input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Search groups..."
              onKeyDown={(e) => e.key === "Enter" && handleGroupSearch()}
              className="text-base sm:text-sm"
            />
            <Button variant="outline" size="sm" onClick={handleGroupSearch}>
              Search
            </Button>
          </div>
          <select
            value={trackingGroupId ?? ""}
            onChange={(e) => setTrackingGroupId(e.target.value ? Number(e.target.value) : null)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
          >
            <option value="">No tracking group (required for processing)</option>
            {groups.map((g) => (
              <option key={g.Group_ID} value={g.Group_ID}>
                {g.Group_Name} (ID: {g.Group_ID})
              </option>
            ))}
          </select>
        </div>

        {/* Default Group Role */}
        <div className="space-y-2">
          <Label htmlFor="role-select">Default Group Role (for group moves)</Label>
          <select
            id="role-select"
            value={defaultGroupRoleId ?? ""}
            onChange={(e) => setDefaultGroupRoleId(e.target.value ? Number(e.target.value) : null)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
          >
            <option value="">None</option>
            {groupRoles.map((r) => (
              <option key={r.Group_Role_ID} value={r.Group_Role_ID}>
                {r.Role_Title} (ID: {r.Group_Role_ID})
              </option>
            ))}
          </select>
        </div>

        {/* Pause Support */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={supportsPause}
              onCheckedChange={(checked) => setSupportsPause(checked === true)}
            />
            <span className="text-sm font-medium">Enable pause/resume</span>
          </label>

          {supportsPause && (
            <div className="pl-6 space-y-3">
              <div className="space-y-2">
                <Label>Paused Group</Label>
                <select
                  value={pausedGroupId ?? ""}
                  onChange={(e) => setPausedGroupId(e.target.value ? Number(e.target.value) : null)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
                >
                  <option value="">Select paused group...</option>
                  {groups.map((g) => (
                    <option key={g.Group_ID} value={g.Group_ID}>
                      {g.Group_Name} (ID: {g.Group_ID})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Pause Milestone</Label>
                <select
                  value={pauseMilestoneId ?? ""}
                  onChange={(e) => setPauseMilestoneId(e.target.value ? Number(e.target.value) : null)}
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
                >
                  <option value="">Select milestone that marks paused...</option>
                  {milestones.map((m) => (
                    <option key={m.milestoneId} value={m.milestoneId}>
                      {m.label} (ID: {m.milestoneId})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Enabled toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
          />
          <span className="text-sm font-medium">Enabled</span>
        </label>

        {/* Milestones */}
        {selectedJourneyId && (
          <div className="space-y-2">
            <Label>Milestones (toggle visibility, edit labels, reorder)</Label>
            {loadingMilestones ? (
              <div className="text-sm text-muted-foreground">Loading milestones...</div>
            ) : (
              <MilestonePicker milestones={milestones} onChange={setMilestones} />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
