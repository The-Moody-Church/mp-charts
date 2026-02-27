"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  getFeatureAccessConfig,
  updateFeatureAccess,
  getAvailableUserGroups,
  flushProfileCaches,
  type UserGroupOption,
} from "./actions";
import type { FeatureAccessConfig } from "@/lib/authorization";

export function AdminPage() {
  const [config, setConfig] = useState<FeatureAccessConfig | null>(null);
  const [userGroups, setUserGroups] = useState<UserGroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [flushing, setFlushing] = useState(false);
  const [flushed, setFlushed] = useState(false);
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadData() {
      try {
        const [configData, groupsData] = await Promise.all([
          getFeatureAccessConfig(),
          getAvailableUserGroups(),
        ]);
        setConfig(configData);
        setUserGroups(groupsData);
      } catch {
        setError("You don't have permission to access this page.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleGroupToggle = useCallback(
    (feature: string, groupId: number, checked: boolean) => {
      setConfig((prev) => {
        if (!prev) return prev;
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
      setSaved((prev) => ({ ...prev, [feature]: false }));
    },
    []
  );

  const handleSave = useCallback(
    async (feature: string) => {
      if (!config) return;
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

  if (loading) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading admin...</div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <Alert>
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            {error || "You don't have permission to access this page."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
            Setup
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

      <Card>
        <CardHeader>
          <CardTitle>Journey Tools</CardTitle>
          <CardDescription>
            Configure which Ministry Platform journeys are available as processing tools
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/journey-tools">
            <Button variant="outline">Manage Journey Tools</Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compliance Tools</CardTitle>
          <CardDescription>
            Configure group role compliance requirements as processing tools
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/admin/compliance-tools">
            <Button variant="outline">Manage Compliance Tools</Button>
          </Link>
        </CardContent>
      </Card>

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
                <Input
                  placeholder="Filter groups..."
                  value={searchTerms[feature] || ""}
                  onChange={(e) =>
                    setSearchTerms((prev) => ({ ...prev, [feature]: e.target.value }))
                  }
                  className="text-base sm:text-sm"
                />
                <FilteredGroupList
                  groups={userGroups}
                  search={searchTerms[feature] || ""}
                  selectedIds={featureConfig.allowedGroupIds}
                  onToggle={(groupId, checked) =>
                    handleGroupToggle(feature, groupId, checked)
                  }
                />
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

function FilteredGroupList({
  groups,
  search,
  selectedIds,
  onToggle,
}: {
  groups: UserGroupOption[];
  search: string;
  selectedIds: number[];
  onToggle: (groupId: number, checked: boolean) => void;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const term = search.toLowerCase();
    return groups.filter(
      (g) =>
        g.User_Group_Name.toLowerCase().includes(term) ||
        String(g.User_Group_ID).includes(term)
    );
  }, [groups, search]);

  if (groups.length === 0) {
    return (
      <div className="rounded-md border p-3">
        <p className="text-sm text-muted-foreground">No User Groups found</p>
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto space-y-2 rounded-md border p-3">
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching groups</p>
      ) : (
        filtered.map((group) => (
          <label
            key={group.User_Group_ID}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              checked={selectedIds.includes(group.User_Group_ID)}
              onCheckedChange={(checked) =>
                onToggle(group.User_Group_ID, checked === true)
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
  );
}
