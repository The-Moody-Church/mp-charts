"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { JourneyToolEditor } from "./journey-tool-editor";
import { getJourneyToolsConfigAction, deleteJourneyToolAction, resolveToolNames, type ResolvedNames } from "./actions";
import type { JourneyToolConfig, JourneyToolsConfig } from "@/lib/journey-tools-config-types";

interface JourneyToolsAdminProps {
  /** Read server-side in page.tsx. Required, so a missed call site is a build error. */
  initialConfig: JourneyToolsConfig;
  /** Program/group display names, also resolved server-side. */
  initialNames: ResolvedNames;
  /** Non-null when the server-side read failed; seeds the existing error Alert. */
  initialError: string | null;
}

export function JourneyToolsAdmin({ initialConfig, initialNames, initialError }: JourneyToolsAdminProps) {
  const [config, setConfig] = useState<JourneyToolsConfig>(initialConfig);
  const [error, setError] = useState<string | null>(initialError);
  const [editingTool, setEditingTool] = useState<JourneyToolConfig | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [names, setNames] = useState<ResolvedNames>(initialNames);

  // Refresh-only: the initial read happens server-side, so this now runs solely
  // from event handlers (after a save or delete), where synchronous setState is
  // fine. Deliberately NOT router.refresh() — that re-renders the RSC payload
  // and can flash the Suspense fallback over the grid, whereas this keeps the
  // existing cards on screen until fresh data arrives, exactly as it does today.
  const reloadConfig = useCallback(async () => {
    try {
      const data = await getJourneyToolsConfigAction();
      setConfig(data);

      // Resolve program + group names for display
      const programIds = data.journeys.map((j) => j.programId).filter(Boolean) as number[];
      const groupIds = data.journeys.flatMap((j) =>
        [j.trackingGroupId, j.pausedGroupId].filter(Boolean) as number[]
      );
      if (programIds.length > 0 || groupIds.length > 0) {
        const resolved = await resolveToolNames(programIds, groupIds);
        setNames(resolved);
      }
    } catch {
      setError("Failed to load journey tools configuration.");
    }
  }, []);

  const handleAdd = () => {
    setEditingTool(null);
    setShowEditor(true);
  };

  const handleEdit = (tool: JourneyToolConfig) => {
    setEditingTool(tool);
    setShowEditor(true);
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Delete journey tool "${slug}"? This cannot be undone.`)) return;
    setDeleting(slug);
    const result = await deleteJourneyToolAction(slug);
    if (!result.success) {
      setError(result.error || "Failed to delete.");
    }
    setDeleting(null);
    reloadConfig();
  };

  const handleSaved = () => {
    setShowEditor(false);
    setEditingTool(null);
    reloadConfig();
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingTool(null);
  };

  if (error) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Alert>
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const existingSlugs = config.journeys.map((j) => j.slug);
  const usedJourneyIds = config.journeys
    .filter((j) => !editingTool || j.slug !== editingTool.slug)
    .map((j) => j.journeyId);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Journey Tools</h1>
          <p className="text-muted-foreground mt-1">
            Configure which Ministry Platform journeys are available as processing tools.
          </p>
        </div>
        {!showEditor && (
          <Button onClick={handleAdd}>Add Journey Tool</Button>
        )}
      </div>

      {showEditor && (
        <JourneyToolEditor
          existingTool={editingTool}
          existingSlugs={existingSlugs}
          usedJourneyIds={usedJourneyIds}
          onSaved={handleSaved}
          onCancel={handleCancel}
        />
      )}

      {!showEditor && (
        <div className="grid gap-4 md:grid-cols-2">
          {config.journeys.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No journey tools configured yet. Click &quot;Add Journey Tool&quot; to get started.
            </div>
          )}
          {config.journeys.map((tool) => (
            <Card key={tool.slug}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{tool.journeyName}</CardTitle>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    tool.enabled
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {tool.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <CardDescription>{tool.description || "No description"}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>Slug: <code className="bg-muted px-1 rounded">/journey/{tool.slug}</code></div>
                  <div>Journey: {tool.journeyName} (ID: {tool.journeyId})</div>
                  <div>Program: {names.programs[tool.programId] ?? "Unknown"} (ID: {tool.programId})</div>
                  <div>Milestones: {tool.milestones.filter((m) => m.visible).length}/{tool.milestones.length} visible</div>
                  {tool.trackingGroupId && (
                    <div>Tracking Group: {names.groups[tool.trackingGroupId] ?? "Unknown"} (ID: {tool.trackingGroupId})</div>
                  )}
                  {tool.supportsPause && tool.pausedGroupId && (
                    <div>Paused Group: {names.groups[tool.pausedGroupId] ?? "Unknown"} (ID: {tool.pausedGroupId})</div>
                  )}
                  {tool.supportsPause && <div>Pause/Resume: enabled</div>}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(tool)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(tool.slug)}
                    disabled={deleting === tool.slug}
                  >
                    {deleting === tool.slug ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
