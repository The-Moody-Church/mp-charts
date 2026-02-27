"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { JourneyToolEditor } from "./journey-tool-editor";
import { getJourneyToolsConfigAction, deleteJourneyToolAction } from "./actions";
import type { JourneyToolConfig, JourneyToolsConfig } from "@/lib/journey-tools-config-types";

export function JourneyToolsAdmin() {
  const [config, setConfig] = useState<JourneyToolsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTool, setEditingTool] = useState<JourneyToolConfig | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await getJourneyToolsConfigAction();
      setConfig(data);
    } catch {
      setError("Failed to load journey tools configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

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
    loadConfig();
  };

  const handleSaved = () => {
    setShowEditor(false);
    setEditingTool(null);
    loadConfig();
  };

  const handleCancel = () => {
    setShowEditor(false);
    setEditingTool(null);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading journey tools...</div>
      </div>
    );
  }

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

  const existingSlugs = config?.journeys.map((j) => j.slug) ?? [];

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
          onSaved={handleSaved}
          onCancel={handleCancel}
        />
      )}

      {!showEditor && (
        <div className="grid gap-4 md:grid-cols-2">
          {config?.journeys.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No journey tools configured yet. Click &quot;Add Journey Tool&quot; to get started.
            </div>
          )}
          {config?.journeys.map((tool) => (
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
                  <div>Journey ID: {tool.journeyId}</div>
                  <div>Milestones: {tool.milestones.filter((m) => m.visible).length}/{tool.milestones.length} visible</div>
                  {tool.trackingGroupId && <div>Tracking Group: {tool.trackingGroupId}</div>}
                  {tool.supportsPause && <div>Pause/Resume: enabled</div>}
                  {tool.programId && <div>Program ID: {tool.programId}</div>}
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
