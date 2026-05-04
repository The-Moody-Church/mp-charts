"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RequirementPicker } from "./requirement-picker";
import { MilestonePicker } from "@/components/admin/journey-tools/milestone-picker";
import {
  getDeduplicatedRequirements,
  saveComplianceToolAction,
} from "./actions";
import {
  getAvailableJourneys,
  getJourneyMilestones,
  getAvailablePrograms,
  getProgramsByIds,
  getAvailableGroups,
  getGroupsByIds,
  getAvailableGroupRoles,
  getActiveMinistries,
  type MPJourney,
  type MPProgram,
  type MPGroup,
  type MPGroupRole,
  type MPMinistry,
} from "@/components/admin/journey-tools/actions";
import {
  generateUniqueSlug,
  type ComplianceToolConfig,
  type ComplianceRequirementConfig,
  type ComplianceMilestoneConfig,
} from "@/lib/compliance-tools-config-types";
import type { JourneyMilestoneConfig } from "@/lib/journey-tools-config-types";

interface ComplianceToolEditorProps {
  existingTool?: ComplianceToolConfig | null;
  existingSlugs: string[];
  usedJourneyIds: number[];
  onSaved: () => void;
  onCancel: () => void;
}

export function ComplianceToolEditor({ existingTool, existingSlugs, usedJourneyIds, onSaved, onCancel }: ComplianceToolEditorProps) {
  const isEditing = !!existingTool;

  // MP reference data
  const [journeys, setJourneys] = useState<MPJourney[]>([]);
  const [programs, setPrograms] = useState<MPProgram[]>([]);
  const [groups, setGroups] = useState<MPGroup[]>([]);
  const [groupRoles, setGroupRoles] = useState<MPGroupRole[]>([]);
  const [ministries, setMinistries] = useState<MPMinistry[]>([]);
  const [ministryFilter, setMinistryFilter] = useState<number | "all">("all");
  const [loadingRef, setLoadingRef] = useState(true);
  const [programSearch, setProgramSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [pausedGroupSearch, setPausedGroupSearch] = useState("");
  const [pausedGroups, setPausedGroups] = useState<MPGroup[]>([]);

  // Form state
  const [toolName, setToolName] = useState(existingTool?.toolName ?? "");
  const [slug, setSlug] = useState(existingTool?.slug ?? "");
  const [description, setDescription] = useState(existingTool?.description ?? "");
  const [enabled, setEnabled] = useState(existingTool?.enabled ?? true);
  const [selectedGroupRoleIds, setSelectedGroupRoleIds] = useState<number[]>(existingTool?.groupRoleIds ?? []);
  const [requirements, setRequirements] = useState<ComplianceRequirementConfig[]>(existingTool?.requirements ?? []);
  const [journeyId, setJourneyId] = useState<number | null>(existingTool?.journeyId ?? null);
  const [journeyMilestones, setJourneyMilestones] = useState<ComplianceMilestoneConfig[]>(existingTool?.journeyMilestones ?? []);
  const [programId, setProgramId] = useState<number | null>(existingTool?.programId ?? null);
  const [trackingGroupId, setTrackingGroupId] = useState<number | null>(existingTool?.trackingGroupId ?? null);
  const [defaultGroupRoleId, setDefaultGroupRoleId] = useState<number | null>(existingTool?.defaultGroupRoleId ?? 2);
  const [supportsPause, setSupportsPause] = useState(existingTool?.supportsPause ?? false);
  const [pausedGroupId, setPausedGroupId] = useState<number | null>(existingTool?.pausedGroupId ?? null);
  const [pauseMilestoneId, setPauseMilestoneId] = useState<number | null>(existingTool?.pauseMilestoneId ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFields, setErrorFields] = useState<Set<string>>(new Set());
  const [loadingRequirements, setLoadingRequirements] = useState(false);
  const [loadingMilestones, setLoadingMilestones] = useState(false);

  const fieldErrorClass = (field: string) =>
    errorFields.has(field) ? "border-red-500 ring-1 ring-red-500" : "";

  const clearFieldError = (field: string) => {
    if (!errorFields.has(field)) return;
    setErrorFields((prev) => { const next = new Set(prev); next.delete(field); return next; });
    if (errorFields.size <= 1) setError(null);
  };

  // Load reference data
  useEffect(() => {
    async function load() {
      try {
        const [j, p, g, gr, m] = await Promise.all([
          getAvailableJourneys(),
          getAvailablePrograms(),
          getAvailableGroups(),
          getAvailableGroupRoles(),
          getActiveMinistries(),
        ]);
        // Ensure existing program is in the list
        if (existingTool?.programId && !p.some((x) => x.Program_ID === existingTool.programId)) {
          const extra = await getProgramsByIds([existingTool.programId]);
          p.unshift(...extra);
        }

        // Ensure existing tracking group is in the list
        if (existingTool?.trackingGroupId && !g.some((x) => x.Group_ID === existingTool.trackingGroupId)) {
          const extra = await getGroupsByIds([existingTool.trackingGroupId]);
          g.unshift(...extra);
        }

        // Ensure existing paused group is in the list
        if (existingTool?.pausedGroupId && !g.some((x) => x.Group_ID === existingTool.pausedGroupId)) {
          const extra = await getGroupsByIds([existingTool.pausedGroupId]);
          g.unshift(...extra);
        }

        setJourneys(j);
        setPrograms(p);
        setGroups(g);
        setGroupRoles(gr);
        setMinistries(m);

        // Pre-populate paused group dropdown with existing selection
        if (existingTool?.pausedGroupId) {
          setPausedGroups(g);
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

  // When group role selection changes, fetch requirements
  const handleGroupRoleToggle = async (roleId: number, checked: boolean) => {
    const newIds = checked
      ? [...selectedGroupRoleIds, roleId]
      : selectedGroupRoleIds.filter(id => id !== roleId);
    setSelectedGroupRoleIds(newIds);
    clearFieldError("groupRoleIds");

    if (newIds.length === 0) {
      setRequirements([]);
      return;
    }

    setLoadingRequirements(true);
    try {
      const resolved = await getDeduplicatedRequirements(newIds);
      // Merge with existing requirements (preserve user edits like labels, visibility, order)
      const existingMap = new Map(requirements.map(r => [`${r.type}:${r.requirementId}`, r]));
      const merged: ComplianceRequirementConfig[] = resolved.map((r, idx) => {
        const key = `${r.type}:${r.requirementId}`;
        const existing = existingMap.get(key);
        if (existing) return existing;
        return {
          requirementId: r.requirementId,
          label: r.label,
          type: r.type,
          sortOrder: idx + 1,
          visible: true,
        };
      });
      setRequirements(merged);
    } catch (err) {
      console.error("Failed to load requirements:", err);
    } finally {
      setLoadingRequirements(false);
    }
  };

  // Load requirements on initial edit
  useEffect(() => {
    if (isEditing && selectedGroupRoleIds.length > 0 && requirements.length > 0) {
      // Already have requirements from existing config, don't reload
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When journey selection changes, fetch milestones
  useEffect(() => {
    if (!journeyId) {
      setJourneyMilestones([]);
      return;
    }

    // Switching back to the saved journey — restore saved milestones
    if (isEditing && journeyId === existingTool?.journeyId) {
      setJourneyMilestones(existingTool.journeyMilestones);
      return;
    }

    setLoadingMilestones(true);
    getJourneyMilestones(journeyId)
      .then((mpMilestones) => {
        const newMilestones: ComplianceMilestoneConfig[] = mpMilestones.map((m, idx) => ({
          milestoneId: m.Milestone_ID,
          label: m.Milestone_Title,
          sortOrder: m.Sort_Order ?? idx + 1,
          visible: true,
        }));
        setJourneyMilestones(newMilestones);
      })
      .catch((err) => console.error("Failed to load milestones:", err))
      .finally(() => setLoadingMilestones(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId]);

  // Auto-generate slug from tool name
  const handleToolNameChange = (name: string) => {
    setToolName(name);
    clearFieldError("toolName");
    if (!isEditing) {
      setSlug(generateUniqueSlug(name, existingSlugs));
    }
  };

  // Search groups
  const handleProgramSearch = async () => {
    try {
      const results = await getAvailablePrograms(programSearch);
      setPrograms(results);
    } catch (err) {
      console.error("Failed to search programs:", err);
    }
  };

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

    if (!toolName.trim()) { errors.push("Tool name is required."); fields.add("toolName"); }
    if (!slug.trim()) { errors.push("Slug is required."); fields.add("slug"); }
    else if (!isEditing && existingSlugs.includes(slug.trim())) { errors.push("A tool with this slug already exists."); fields.add("slug"); }
    if (selectedGroupRoleIds.length === 0) { errors.push("At least one group role must be selected."); fields.add("groupRoleIds"); }
    if (requirements.filter(r => r.visible).length === 0 && journeyMilestones.filter(m => m.visible).length === 0) {
      errors.push("At least one requirement or milestone must be visible."); fields.add("requirements");
    }
    if ((journeyId || journeyMilestones.length > 0) && !programId) {
      errors.push("Program is required when a journey is attached."); fields.add("programId");
    }

    if (errors.length > 0) {
      setError(errors.join(" "));
      setErrorFields(fields);
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const tool: ComplianceToolConfig = {
        slug,
        toolName: toolName.trim(),
        description: description.trim(),
        enabled,
        groupRoleIds: selectedGroupRoleIds,
        journeyId,
        journeyMilestones,
        requirements,
        programId,
        trackingGroupId,
        defaultGroupRoleId,
        supportsPause,
        pausedGroupId: supportsPause ? pausedGroupId : null,
        pauseMilestoneId: supportsPause ? pauseMilestoneId : null,
        createdAt: existingTool?.createdAt ?? now,
        updatedAt: now,
      };

      const result = await saveComplianceToolAction(tool, !isEditing);
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
      setError("Failed to save compliance tool.");
    } finally {
      setSaving(false);
    }
  };

  // Adapt ComplianceMilestoneConfig[] ↔ JourneyMilestoneConfig[] for the shared MilestonePicker
  const milestonePickerData: JourneyMilestoneConfig[] = journeyMilestones.map(m => ({
    milestoneId: m.milestoneId,
    label: m.label,
    sortOrder: m.sortOrder,
    visible: m.visible,
    discontinuesJourney: m.discontinuesJourney,
    completionBadge: m.completionBadge,
  }));

  const handleMilestonesChange = (updated: JourneyMilestoneConfig[]) => {
    setJourneyMilestones(updated.map(m => ({
      milestoneId: m.milestoneId,
      label: m.label,
      sortOrder: m.sortOrder,
      visible: m.visible,
      discontinuesJourney: m.discontinuesJourney,
      completionBadge: m.completionBadge,
    })));
    clearFieldError("requirements");
  };

  // All milestones from journey (for pause milestone select)
  const allMilestones = journeyMilestones;

  if (loadingRef) {
    return <div className="text-sm text-muted-foreground">Loading configuration data...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Compliance Tool" : "Add Compliance Tool"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* ── Section: Title & Description ── */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Title &amp; Description</legend>

          {/* Tool Name and Slug */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="tool-name">Tool Name</Label>
              <Input
                id="tool-name"
                value={toolName}
                onChange={(e) => handleToolNameChange(e.target.value)}
                placeholder="e.g., Volunteer Compliance"
                className={`text-base sm:text-sm ${fieldErrorClass("toolName")}`}
              />
            </div>
            <div className="w-full sm:w-48 space-y-2">
              <Label htmlFor="tool-slug">URL Slug</Label>
              <Input
                id="tool-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-{2,}/g, "-"));
                  clearFieldError("slug");
                }}
                placeholder="e.g., volunteer-compliance"
                disabled={isEditing}
                className={`text-base sm:text-sm ${fieldErrorClass("slug")}`}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="tool-desc">Description</Label>
            <Textarea
              id="tool-desc"
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

        {/* ── Section: Group Roles & Requirements ── */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Group Roles &amp; Requirements</legend>

          {/* Group Roles Selection */}
          <div className="space-y-2">
            <Label>Group Roles (which roles have compliance requirements)</Label>
            <div className="space-y-1">
              <Label htmlFor="ministry-filter" className="text-xs text-muted-foreground font-normal">
                Filter by Ministry
              </Label>
              <select
                id="ministry-filter"
                value={ministryFilter === "all" ? "all" : String(ministryFilter)}
                onChange={(e) => {
                  const val = e.target.value;
                  setMinistryFilter(val === "all" ? "all" : Number(val));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
              >
                <option value="all">All Ministries</option>
                {ministries.map((m) => (
                  <option key={m.Ministry_ID} value={m.Ministry_ID}>
                    {m.Ministry_Name}
                  </option>
                ))}
              </select>
            </div>
            {(() => {
              const filtered = ministryFilter === "all"
                ? groupRoles
                : groupRoles.filter((r) => r.Ministry_ID === ministryFilter);
              return (
                <div className={`max-h-48 overflow-y-auto space-y-2 rounded-md border p-3 ${fieldErrorClass("groupRoleIds")}`}>
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {groupRoles.length === 0 ? "No group roles found" : "No roles match this ministry filter"}
                    </p>
                  ) : (
                    filtered.map((role) => (
                      <label
                        key={role.Group_Role_ID}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedGroupRoleIds.includes(role.Group_Role_ID)}
                          onCheckedChange={(checked) =>
                            handleGroupRoleToggle(role.Group_Role_ID, checked === true)
                          }
                        />
                        <span>{role.Role_Title}</span>
                        <span className="text-muted-foreground">
                          (ID: {role.Group_Role_ID})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              );
            })()}
          </div>

          {/* Requirements */}
          <div className="space-y-2">
            <Label>Requirements (toggle visibility, edit labels, reorder)</Label>
            {loadingRequirements ? (
              <div className="text-sm text-muted-foreground">Loading requirements...</div>
            ) : (
              <div className={fieldErrorClass("requirements") ? `rounded-md ${fieldErrorClass("requirements")}` : ""}>
                <RequirementPicker requirements={requirements} onChange={(r) => { setRequirements(r); clearFieldError("requirements"); }} />
              </div>
            )}
          </div>
        </fieldset>

        {/* ── Section: Journey (Optional) ── */}
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-semibold">Journey (Optional)</legend>

          <div className="space-y-2">
            <Label htmlFor="journey-select">Journey (merge journey milestones into checklist)</Label>
            <select
              id="journey-select"
              value={journeyId ?? ""}
              onChange={(e) => setJourneyId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
            >
              <option value="">No journey attached</option>
              {journeys.filter((j) => !usedJourneyIds.includes(j.Journey_ID)).map((j) => (
                <option key={j.Journey_ID} value={j.Journey_ID}>
                  {j.Journey_Name} (ID: {j.Journey_ID})
                </option>
              ))}
            </select>
          </div>

          {/* Journey Milestones */}
          {journeyId && (
            <div className="space-y-2">
              <Label>Journey Milestones (toggle visibility, edit labels, reorder)</Label>
              {loadingMilestones ? (
                <div className="text-sm text-muted-foreground">Loading milestones...</div>
              ) : (
                <MilestonePicker milestones={milestonePickerData} onChange={handleMilestonesChange} />
              )}
            </div>
          )}

          {/* Program (for milestone writes) */}
          <div className="space-y-2">
            <Label>Program (for milestone writes)</Label>
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
              id="program-select"
              value={programId ?? ""}
              onChange={(e) => { setProgramId(e.target.value ? Number(e.target.value) : null); clearFieldError("programId"); }}
              className={`flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm ${fieldErrorClass("programId")}`}
            >
              <option value="">None</option>
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
              <option value="">No tracking group (required for processing)</option>
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
                <Label htmlFor="default-role-select">Default Group Role (for group moves)</Label>
                <select
                  id="default-role-select"
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
                    {journeyId && allMilestones.length > 0 && (
                      <div className="space-y-2">
                        <Label>Pause Milestone</Label>
                        <select
                          value={pauseMilestoneId ?? ""}
                          onChange={(e) => setPauseMilestoneId(e.target.value ? Number(e.target.value) : null)}
                          className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm"
                        >
                          <option value="">Select milestone that marks paused...</option>
                          {allMilestones.map((m) => (
                            <option key={m.milestoneId} value={m.milestoneId}>
                              {m.label} (ID: {m.milestoneId})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </fieldset>

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
