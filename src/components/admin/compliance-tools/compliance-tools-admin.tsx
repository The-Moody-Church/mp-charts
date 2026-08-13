"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ComplianceToolEditor } from "./compliance-tool-editor";
import { getComplianceToolsConfigAction, deleteComplianceToolAction } from "./actions";
import type { ComplianceToolConfig, ComplianceToolsConfig } from "@/lib/compliance-tools-config-types";

interface ComplianceToolsAdminProps {
  /** Read server-side in page.tsx. Required, so a missed call site is a build error. */
  initialConfig: ComplianceToolsConfig;
  /** Non-null when the server-side read failed; seeds the existing error Alert. */
  initialError: string | null;
}

export function ComplianceToolsAdmin({ initialConfig, initialError }: ComplianceToolsAdminProps) {
  const [config, setConfig] = useState<ComplianceToolsConfig>(initialConfig);
  const [error, setError] = useState<string | null>(initialError);
  const [editingTool, setEditingTool] = useState<ComplianceToolConfig | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Refresh-only: the initial read happens server-side, so this now runs solely
  // from event handlers (after a save or delete), where synchronous setState is
  // fine. Deliberately NOT router.refresh() — that re-renders the RSC payload
  // and can flash the Suspense fallback over the grid, whereas this keeps the
  // existing cards on screen until fresh data arrives, exactly as it does today.
  const reloadConfig = useCallback(async () => {
    try {
      const data = await getComplianceToolsConfigAction();
      setConfig(data);
    } catch {
      setError("Failed to load compliance tools configuration.");
    }
  }, []);

  // Re-read on mount AND on <Activity> restore.
  //
  // React destroys a hidden Activity's effects and re-creates them when it becomes
  // visible again, but PRESERVES state — so the server-seeded initialConfig goes
  // stale on back-navigation: the useState seed survives and, once the read moved
  // server-side, no effect was left to re-run. Confirmed on TMC1 (2026-08-13):
  // edited the config out-of-band, navigated away, hit Back, and the grid still
  // showed the old value; only a hard refresh, which re-runs the RSC, picked it up.
  //
  // The fetch is inlined rather than calling reloadConfig() because the rule flags
  // a useCallback loader invoked from an effect regardless of where its setState
  // sits (Finding A's asymmetry) — that is the exact violation moving this read
  // server-side removed. Here every setState is in a continuation the rule can see.
  //
  // Costs one duplicate read per page load, right after the server already did it.
  // Accepted: admin-only screen, and it is the pre-server-move cost returning
  // rather than a new one.
  useEffect(() => {
    let cancelled = false;
    getComplianceToolsConfigAction()
      .then((data) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load compliance tools configuration.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdd = () => {
    setEditingTool(null);
    setShowEditor(true);
  };

  const handleEdit = (tool: ComplianceToolConfig) => {
    setEditingTool(tool);
    setShowEditor(true);
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Delete compliance tool "${slug}"? This cannot be undone.`)) return;
    setDeleting(slug);
    const result = await deleteComplianceToolAction(slug);
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

  const existingSlugs = config.tools.map((t) => t.slug);
  const usedJourneyIds = config.tools
    .filter((t) => (!editingTool || t.slug !== editingTool.slug) && t.journeyId != null)
    .map((t) => t.journeyId!);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">Compliance Tools</h1>
          <p className="text-muted-foreground mt-1">
            Configure which group role requirements are tracked as compliance processing tools.
          </p>
        </div>
        {!showEditor && (
          <Button onClick={handleAdd}>Add Compliance Tool</Button>
        )}
      </div>

      {showEditor && (
        <ComplianceToolEditor
          existingTool={editingTool}
          existingSlugs={existingSlugs}
          usedJourneyIds={usedJourneyIds}
          onSaved={handleSaved}
          onCancel={handleCancel}
        />
      )}

      {!showEditor && (
        <div className="grid gap-4 md:grid-cols-2">
          {config.tools.length === 0 && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No compliance tools configured yet. Click &quot;Add Compliance Tool&quot; to get started.
            </div>
          )}
          {config.tools.map((tool) => (
            <Card key={tool.slug}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{tool.toolName}</CardTitle>
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
                  <div>Slug: <code className="bg-muted px-1 rounded">/compliance/{tool.slug}</code></div>
                  <div>Group Roles: {tool.groupRoleIds.length} selected</div>
                  <div>Requirements: {tool.requirements.filter(r => r.visible).length}/{tool.requirements.length} visible</div>
                  {tool.journeyId && <div>Journey: ID {tool.journeyId} ({tool.journeyMilestones.filter(m => m.visible).length} milestones)</div>}
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
