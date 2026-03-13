"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { FeedbackConfig } from "@/lib/feedback-config-types";
import {
  getFeedbackConfig,
  saveFeedbackConfigAction,
  getGitHubTokenConfigured,
} from "./actions";

export function FeedbackSettings() {
  const [config, setConfig] = useState<FeedbackConfig>({
    enabled: false,
  });
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [cfg, hasToken] = await Promise.all([
          getFeedbackConfig(),
          getGitHubTokenConfigured(),
        ]);
        setConfig(cfg);
        setTokenConfigured(hasToken);
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
            GitHub Integration
          </legend>

          <div className="space-y-2">
            <Label>GitHub Token Status</Label>
            {tokenConfigured ? (
              <p className="text-sm text-green-600">
                GITHUB_FEEDBACK_TOKEN is configured. Feedback submissions will create GitHub issues.
              </p>
            ) : (
              <p className="text-sm text-amber-600">
                GITHUB_FEEDBACK_TOKEN is not set. Add it to your environment variables to enable feedback.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Feedback submissions create issues on the configured GitHub repository
              (GITHUB_FEEDBACK_REPO, defaults to The-Moody-Church/mp-charts).
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
