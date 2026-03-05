"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { FeedbackConfig } from "@/lib/feedback-config-types";
import {
  getFeedbackConfig,
  saveFeedbackConfigAction,
  getFeedbackTypes,
} from "./actions";

export function FeedbackSettings() {
  const [config, setConfig] = useState<FeedbackConfig>({
    enabled: false,
    feedbackTypeId: null,
    assignedToContactId: null,
  });
  const [feedbackTypes, setFeedbackTypes] = useState<
    { Feedback_Type_ID: number; Feedback_Type: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [cfg, types] = await Promise.all([
          getFeedbackConfig(),
          getFeedbackTypes(),
        ]);
        setConfig(cfg);
        setFeedbackTypes(types);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load feedback config."
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const result = await saveFeedbackConfigAction(config);
      if (!result.success) {
        setError(result.error || "Failed to save.");
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Failed to save feedback config.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading feedback settings...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
            Feedback Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure the user feedback feature
          </p>
        </div>
      </div>

      <div className="max-w-lg space-y-6">
        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-medium">General</legend>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="feedback-enabled">Enable Feedback</Label>
              <p className="text-xs text-muted-foreground">
                Show the feedback button to all logged-in users
              </p>
            </div>
            <Switch
              id="feedback-enabled"
              checked={config.enabled}
              onCheckedChange={(checked) =>
                setConfig({ ...config, enabled: checked })
              }
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm font-medium">
            Ministry Platform Settings
          </legend>

          <div className="space-y-2">
            <Label htmlFor="feedback-type">Feedback Type</Label>
            <select
              id="feedback-type"
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={config.feedbackTypeId ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  feedbackTypeId: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            >
              <option value="">Select a feedback type...</option>
              {feedbackTypes.map((ft) => (
                <option key={ft.Feedback_Type_ID} value={ft.Feedback_Type_ID}>
                  {ft.Feedback_Type}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The feedback type assigned to all submissions
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned-contact">
              Assigned To (Contact ID)
            </Label>
            <Input
              id="assigned-contact"
              type="number"
              placeholder="Optional — Contact ID to assign feedback to"
              value={config.assignedToContactId ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  assignedToContactId: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              All feedback entries will be assigned to this contact for review
            </p>
          </div>
        </fieldset>

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && (
            <p className="text-sm text-green-600">Settings saved.</p>
          )}
        </div>
      </div>
    </div>
  );
}
