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
  getProgramsByIds,
  getGroupsByIds,
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
  usedJourneyIds: number[];
  onSaved: () => void;
  onCancel: () => void;
}

export function JourneyToolEditor({ existingTool, existingSlugs, usedJourneyIds, onSaved, onCancel }: JourneyToolEditorProps) {
  const isEditing = !!existingTool;

  // MP reference data
  const [journeys, setJourneys] = useState<MPJourney[]>([]);
  const [programs, setPrograms] = useState<MPProgram[]>([]);
  const [groups, setGroups] = useState<MPGroup[]>([]);
  const [groupRoles, setGroupRoles] = useState<MPGroupRole[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [programSearch, setProgramSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [pausedGroupSearch, setPausedGroupSearch] = useState("");
  const [pausedGroups, setPausedGroups] = useState<MPGroup[]>([]);

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
  const [defaultGroupRoleId, setDefaultGroupRoleId] = useState<number | null>(existingTool?.defaultGroupRoleId ?? 2);
  const [supportsPause, setSupportsPause] = useState(existingTool?.supportsPause ?? false);
  const [pauseMilestoneId, setPauseMilestoneId] = useState<number | null>(existingTool?.pauseMilestoneId ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<Set<string>>(new Set());
  const [loadingMilestones, setLoadingMilestones] = useState(false);

  const fieldErrorClass = (field: string) =>
    errorFields.has(field) ? "border-red-500 ring-1 ring-red-500" : "";

  const clearFieldError = (field: string) => {
    if (!errorFields.has(field)) return;
    setErrorFields((prev) => { const next = new Set(prev); next.delete(field); return next; });
    if (errorFields.size <= 1) setError(null);
  };

  // Load reference data, ensuring existing selections are present in dropdowns
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
        setGroupRoles(gr);

        // Ensure existing program is in the list
        if (existingTool?.programId && !p.some((x) => x.Program_ID === existingTool.programId)) {
          const extra = await getProgramsByIds([existingTool.programId]);
          p.unshift(...extra);
        }
        setPrograms(p);

        // Ensure existing tracking group is in the list
        if (existingTool?.trackingGroupId && !g.some((x) => x.Group_ID === existingTool.trackingGroupId)) {
          const extra = await getGroupsByIds([existingTool.trackingGroupId]);
          g.unshift(...extra);
        }
        setGroups(g);

        // Pre-populate paused group dropdown with existing selection
        if (existingTool?.pausedGroupId) {
          const paused = await getGroupsByIds([existingTool.pausedGroupId]);
          setPausedGroups(paused);
        }
      } catch (err) {
        console.error("Failed to load reference data:", err);
        setError("Failed to load configuration data from Ministry Platform.");
      } finally {
        setLoadingRef(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When journey selection changes, fetch milestones from MP.
  // When editing, merge with existing config to preserve custom labels/visibility/order.
  useEffect(() => {
    if (!selectedJourneyId) return;

    setLoadingMilestones(true);
    getJourneyMilestones(selectedJourneyId)
      .then((mpMilestones) => {
        const existingByIds = new Map(
          (existingTool?.milestones ?? []).map((m) => [m.milestoneId, m])
        );
        const merged: JourneyMilestoneConfig[] = mpMilestones.map((m, idx) => {
          const existing = existingByIds.get(m.Milestone_ID);
          if (existing && isEditing && selectedJourneyId === existingTool?.journeyId) {
            return existing;
          }
          return {
            milestoneId: m.Milestone_ID,
            label: m.Milestone_Title,
            sortOrder: m.Sort_Order ?? idx + 1,
            visible: true,
          };
        });
        setMilestones(merged);
      })
      .catch((err) => console.error("Failed to load milestones:", err))
      .finally(() => setLoadingMilestones(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJourneyId]);

  // Manual refresh — re-fetch milestones from MP and merge with current in-memory edits.
  // Preserves all user changes (labels, visibility, sort order, discontinue config) and
  // appends any milestones newly added in MP since the last load.
  const handleRefreshMilestones = async () => {
    if (!selectedJourneyId) return;
    setLoadingMilestones(true);
    try {
      const mpMilestones = await getJourneyMilestones(selectedJourneyId);
      const currentByIds = new Map(milestones.map((m) => [m.milestoneId, m]));
      const maxSortOrder = milestones.reduce((max, m) => Math.max(max, m.sortOrder), 0);
      let nextSortOrder = maxSortOrder;
      const merged: JourneyMilestoneConfig[] = mpMilestones.map((m) => {
        const existing = currentByIds.get(m.Milestone_ID);
        if (existing) return existing;
        nextSortOrder += 1;
        return {
          milestoneId: m.Milestone_ID,
          label: m.Milestone_Title,
          sortOrder: nextSortOrder,
          visible: true,
        };
      });
      setMilestones(merged);
    } catch (err) {
      console.error("Failed to refresh milestones:", err);
    } finally {
      setLoadingMilestones(false);
    }
  };

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

  // Search programs
  const handleProgramSearch = async () => {
    try {
      const results = await getAvailablePrograms(programSearch);
      setPrograms(results);
    } catch (err) {
      console.error("Failed to search programs:", err);
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

  // Search paused groups
  const handlePausedGroupSearch = async () => {
    try {
      const results = await getAvailableGroups(pausedGroupSearch);
      setPausedGroups(results);
    } catch (err) {
      console.error("Failed to search paused groups:", err);
    }
  };

  const handleSave = async () => {
    setError(null);
    setErrorFields(new Set());

    // Client-side validation — collect all errors at once
    const errors: string[] = [];
    const fields = new Set<string>();

    if (!selectedJourneyId) { errors.push("Please select a journey."); fields.add("journey"); }
    if (!slug.trim()) { errors.push("Slug is required."); fields.add("slug"); }
    else if (!isEditing && existingSlugs.includes(slug.trim())) { errors.push("A tool with this slug already exists."); fields.add("slug"); }
    if (!journeyName.trim()) { errors.push("Name is required."); fields.add("journeyName"); }
    if (!programId) { errors.push("Program is required."); fields.add("programId"); }
    if (milestones.filter((m) => m.visible).length === 0) { errors.push("At least one milestone must be visible."); fields.add("milestones"); }

    if (errors.length > 0) {
      setError(errors.join(" "));
      setErrorFields(fields);
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const tool: JourneyToolConfig = {
        slug,
        journeyId: selectedJourneyId!,
        journeyName: journeyName.trim(),
        description: description.trim(),
        enabled,
        milestones,
        programId: programId!,
        trackingGroupId,
        pausedGroupId: trackingGroupId ? pausedGroupId : null,
        defaultGroupRoleId: trackingGroupId ? defaultGroupRoleId : null,
        supportsPause: trackingGroupId ? supportsPause : false,
        pauseMilestoneId: trackingGroupId && supportsPause ? pauseMilestoneId : null,
        createdAt: existingTool?.createdAt ?? now,
        updatedAt: now,
      };

      const result = await saveJourneyToolAction(tool, !isEditing);
      if (!result.success) {
        const errMsg = result.error || "Failed to save.";
        // Parse field names from server Zod errors (format: "fieldName: message; ...")
        const serverFields = new Set<string>();
        for (const segment of errMsg.split("; ")) {
          const colonIdx = segment.indexOf(":");
          if (colonIdx > 0) serverFields.add(segment.substring(0, colonIdx));
        }
        setError(errMsg);
        setErrorFields(serverFields);
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
      <CardContent className="space-y-8">
        {/* ── Section: Title & Description ── */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Title &amp; Description</legend>

          {/* Journey Selection */}
          <div className="space-y-2">
            <Label htmlFor="journey-select">Journey</Label>
            <select
              id="journey-select"
              value={selectedJourneyId ?? ""}
              onChange={(e) => { handleJourneySelect(Number(e.target.value)); clearFieldError("journey"); }}
              disabled={isEditing}
              className={`flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm ${fieldErrorClass("journey")}`}
            >
              <option value="">Select a journey...</option>
              {journeys.filter((j) => !usedJourneyIds.includes(j.Journey_ID)).map((j) => (
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
                onChange={(e) => { setJourneyName(e.target.value); clearFieldError("journeyName"); }}
                placeholder="e.g., Baptism Processing"
                className={`text-base sm:text-sm ${fieldErrorClass("journeyName")}`}
              />
            </div>
            <div className="w-full sm:w-48 space-y-2">
              <Label htmlFor="journey-slug">URL Slug</Label>
              <Input
                id="journey-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"));
                  clearFieldError("slug");
                }}
                placeholder="e.g., baptism"
                disabled={isEditing}
                className={`text-base sm:text-sm ${fieldErrorClass("slug")}`}
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

          {/* Enabled toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <span className="text-sm font-medium">Tool Enabled</span>
          </label>
        </fieldset>

        {/* ── Section: Program ── */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Program</legend>
          <div className="space-y-2">
            <Label>Program (required — for milestone writes)</Label>
            <div className="flex gap-2">
              <Input
                value={programSearch}
                onChange={(e) => setProgramSearch(e.target.value)}
                placeholder="Search programs..."
                onKeyDown={(e) => e.key === "Enter" && handleProgramSearch()}
                className="text-base sm:text-sm"
              />
              <Button variant="outline" size="sm" onClick={handleProgramSearch}>
                Search
              </Button>
            </div>
            <select
              value={programId ?? ""}
              onChange={(e) => { setProgramId(e.target.value ? Number(e.target.value) : null); clearFieldError("programId"); }}
              className={`flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm ${fieldErrorClass("programId")}`}
            >
              <option value="">Select a program...</option>
              {programs.map((p) => (
                <option key={p.Program_ID} value={p.Program_ID}>
                  {p.Program_Name} (ID: {p.Program_ID})
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        {/* ── Section: Groups ── */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Groups</legend>

          {/* Tracking Group */}
          <div className="space-y-2">
            <Label>Tracking Group (optional)</Label>
            <p className="text-xs text-muted-foreground">
              When set, participants are discovered from group membership (Current/Paused tabs).
              When empty, participants are discovered from milestone records (In Progress/Completed tabs).
            </p>
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
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null;
                setTrackingGroupId(id);
                if (!id) {
                  setSupportsPause(false);
                  setPausedGroupId(null);
                  setPauseMilestoneId(null);
                  setDefaultGroupRoleId(null);
                }
              }}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
            >
              <option value="">None (milestone-based discovery)</option>
              {groups.map((g) => (
                <option key={g.Group_ID} value={g.Group_ID}>
                  {g.Group_Name} (ID: {g.Group_ID})
                </option>
              ))}
            </select>
          </div>

          {/* Group-mode options (only when tracking group is set) */}
          {trackingGroupId && (
            <div className="space-y-4 border-t pt-4">
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
                      <div className="flex gap-2">
                        <Input
                          value={pausedGroupSearch}
                          onChange={(e) => setPausedGroupSearch(e.target.value)}
                          placeholder="Search groups..."
                          onKeyDown={(e) => e.key === "Enter" && handlePausedGroupSearch()}
                          className="text-base sm:text-sm"
                        />
                        <Button variant="outline" size="sm" onClick={handlePausedGroupSearch}>
                          Search
                        </Button>
                      </div>
                      <select
                        value={pausedGroupId ?? ""}
                        onChange={(e) => setPausedGroupId(e.target.value ? Number(e.target.value) : null)}
                        className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
                      >
                        <option value="">Select paused group...</option>
                        {pausedGroups.map((g) => (
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
            </div>
          )}
        </fieldset>

        {/* ── Section: Milestones ── */}
        {selectedJourneyId && (
          <fieldset className={`space-y-4 rounded-lg border p-4 ${fieldErrorClass("milestones")}`}>
            <legend className="px-2 text-sm font-semibold">Milestones</legend>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Toggle visibility, edit labels, reorder, and configure journey discontinuation per milestone.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefreshMilestones}
                disabled={loadingMilestones}
                className="gap-1.5 flex-shrink-0"
                title="Re-fetch milestones from Ministry Platform (preserves your edits)"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh from MP
              </Button>
            </div>
            {loadingMilestones ? (
              <div className="text-sm text-muted-foreground">Loading milestones...</div>
            ) : (
              <MilestonePicker milestones={milestones} onChange={(m) => { setMilestones(m); clearFieldError("milestones"); }} />
            )}
          </fieldset>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-md p-2">{error}</div>
          )}
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
            <Button variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
