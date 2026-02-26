"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updateFeatureAccess, flushProfileCaches, type UserGroupOption } from "./actions";
import type { FeatureAccessConfig } from "@/lib/authorization";

interface AdminPageProps {
  initialConfig: FeatureAccessConfig;
  userGroups: UserGroupOption[];
}

export function AdminPage({ initialConfig, userGroups }: AdminPageProps) {
  const [config, setConfig] = useState<FeatureAccessConfig>(initialConfig);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [flushing, setFlushing] = useState(false);
  const [flushed, setFlushed] = useState(false);

  const handleGroupToggle = useCallback(
    (feature: string, groupId: number, checked: boolean) => {
      setConfig((prev) => {
        const featureConfig = prev[feature];
        if (!featureConfig) return prev;

        const currentIds = featureConfig.allowedGroupIds;
        const newIds = checked
          ? [...currentIds, groupId]
          : currentIds.filter((id) => id !== groupId);

        return {
          ...prev,
          [feature]: { ...featureConfig, allowedGroupIds: newIds },
        };
      });
      // Clear saved indicator when user makes changes
      setSaved((prev) => ({ ...prev, [feature]: false }));
    },
    []
  );

  const handleSave = useCallback(
    async (feature: string) => {
      setSaving((prev) => ({ ...prev, [feature]: true }));
      const result = await updateFeatureAccess(
        feature,
        config[feature]?.allowedGroupIds || []
      );
      setSaving((prev) => ({ ...prev, [feature]: false }));
      if (result.success) {
        setSaved((prev) => ({ ...prev, [feature]: true }));
      }
    },
    [config]
  );

  const handleFlushCache = useCallback(async () => {
    setFlushing(true);
    await flushProfileCaches();
    setFlushing(false);
    setFlushed(true);
    setTimeout(() => setFlushed(false), 3000);
  }, []);

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
            Access Control
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage which User Groups can access each feature
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleFlushCache}
          disabled={flushing}
        >
          {flushing
            ? "Flushing..."
            : flushed
              ? "Cache Flushed"
              : "Flush Profile Cache"}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {Object.entries(config).map(([feature, featureConfig]) => (
          <Card key={feature}>
            <CardHeader>
              <CardTitle>{featureConfig.label}</CardTitle>
              <CardDescription>{featureConfig.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Allowed User Groups</p>
                <div className="max-h-48 overflow-y-auto space-y-2 rounded-md border p-3">
                  {userGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No User Groups found
                    </p>
                  ) : (
                    userGroups.map((group) => (
                      <label
                        key={group.User_Group_ID}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={featureConfig.allowedGroupIds.includes(
                            group.User_Group_ID
                          )}
                          onCheckedChange={(checked) =>
                            handleGroupToggle(
                              feature,
                              group.User_Group_ID,
                              checked === true
                            )
                          }
                        />
                        <span>{group.User_Group_Name}</span>
                        <span className="text-muted-foreground">
                          (ID: {group.User_Group_ID})
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSave(feature)}
                  disabled={saving[feature]}
                >
                  {saving[feature]
                    ? "Saving..."
                    : saved[feature]
                      ? "Saved"
                      : "Save"}
                </Button>
                {saved[feature] && (
                  <span className="text-sm text-green-600">Changes saved</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
