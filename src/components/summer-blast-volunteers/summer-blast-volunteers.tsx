"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ProcessingGrid,
  ProcessingSearchBar,
  ProcessingSortSelect,
} from "@/components/processing";
import {
  searchByName,
  sortCards,
  SORT_OPTIONS,
  type ProcessingSortOption,
} from "@/lib/processing-utils";

// Signups tab has an extra "Signup Date (Newest)" option that's the default.
const INTAKE_SORT_OPTIONS: { value: ProcessingSortOption; label: string }[] = [
  { value: "signup-date-desc", label: "Signup Date (Newest)" },
  ...SORT_OPTIONS,
];
import { Button } from "@/components/ui/button";
import { IntakeCard } from "./intake-card";
import { VolunteerCard } from "./volunteer-card";
import { IntakeDetailModal } from "./intake-detail-modal";
import { VolunteerDetailModal } from "./volunteer-detail-modal";
import {
  bulkAddToSummerBlast,
  getSummerBlastIntake,
  getSummerBlastVolunteers,
} from "./actions";
import type {
  SummerBlastIntakeCard,
  SummerBlastVolunteerCard,
} from "@/lib/dto";

interface Props {
  eventName: string;
  eventEndDate: string;
  roleOptions: { groupRoleId: number; label: string }[];
  tempGroupRoleId: number;
}

function formatCutoffLabel(eventEndDate: string): string {
  // eventEndDate is "YYYY-MM-DD" in CT.
  const [y, m, d] = eventEndDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SummerBlastVolunteers({
  eventName,
  eventEndDate,
  roleOptions,
  tempGroupRoleId,
}: Props) {
  const cutoffLabel = useMemo(() => formatCutoffLabel(eventEndDate), [eventEndDate]);

  const [activeTab, setActiveTab] = useState("intake");
  const [intake, setIntake] = useState<SummerBlastIntakeCard[]>([]);
  const [volunteers, setVolunteers] = useState<SummerBlastVolunteerCard[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [intakeSortOption, setIntakeSortOption] = useState<ProcessingSortOption>("signup-date-desc");
  const [volunteersSortOption, setVolunteersSortOption] = useState<ProcessingSortOption>("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIntake, setSelectedIntake] = useState<SummerBlastIntakeCard | null>(null);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [selectedVolunteer, setSelectedVolunteer] = useState<SummerBlastVolunteerCard | null>(null);
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false);

  // Bulk selection for the Signups tab — selected response IDs
  const [bulkSelected, setBulkSelected] = useState<Set<number>>(new Set());
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    succeededCount: number;
    failedCount: number;
  } | null>(null);

  const toggleBulkSelect = useCallback((responseId: number, selected: boolean) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (selected) next.add(responseId);
      else next.delete(responseId);
      return next;
    });
  }, []);
  const clearBulkSelection = useCallback(() => setBulkSelected(new Set()), []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intakeData, volunteerData] = await Promise.all([
        getSummerBlastIntake(),
        getSummerBlastVolunteers(),
      ]);
      setIntake(intakeData);
      setVolunteers(volunteerData);
    } catch (err) {
      console.error("Failed to load Summer Blast data:", err);
      setError("Failed to load data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Drop selections for response IDs that are no longer in the intake list
  // (e.g., after a bulk add closes their Responses).
  useEffect(() => {
    setBulkSelected((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(intake.map((c) => c.responseId));
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (present.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [intake]);

  const handleBulkConfirm = async () => {
    if (bulkSelected.size === 0) return;
    setBulkSubmitting(true);
    setBulkResult(null);
    try {
      const items = intake
        .filter((c) => bulkSelected.has(c.responseId))
        .map((c) => ({ contactId: c.info.Contact_ID, responseId: c.responseId }));
      const result = await bulkAddToSummerBlast(items);
      setBulkResult({
        succeededCount: result.succeededCount,
        failedCount: result.failures.length,
      });
      if (result.succeededCount > 0) {
        await fetchAll(); // succeeded IDs leave the intake list; the prune effect drops them from selection. Failed IDs remain selected so the user can retry.
      }
    } catch (err) {
      console.error("Bulk add failed:", err);
      setBulkResult({ succeededCount: 0, failedCount: bulkSelected.size });
    } finally {
      setBulkSubmitting(false);
    }
  };

  const filteredIntake = useMemo(
    () => sortCards(searchByName(intake, searchQuery), intakeSortOption),
    [intake, searchQuery, intakeSortOption],
  );
  const filteredVolunteers = useMemo(
    () => sortCards(searchByName(volunteers, searchQuery), volunteersSortOption),
    [volunteers, searchQuery, volunteersSortOption],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{eventName} Volunteers</h1>
        <p className="text-muted-foreground">
          Track signups and volunteers for the event. &ldquo;Will Expire&rdquo; means a
          requirement is currently valid but expires before {cutoffLabel}.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList className="w-full sm:w-fit h-auto">
            <TabsTrigger
              value="intake"
              className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5"
            >
              Signups
              {intake.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                  {intake.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="volunteers"
              className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5"
            >
              Volunteers
              {volunteers.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                  {volunteers.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-fit">
            <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />
            {activeTab === "intake" ? (
              <ProcessingSortSelect
                value={intakeSortOption}
                onChange={setIntakeSortOption}
                options={INTAKE_SORT_OPTIONS}
              />
            ) : (
              <ProcessingSortSelect
                value={volunteersSortOption}
                onChange={setVolunteersSortOption}
              />
            )}
          </div>
        </div>

        <TabsContent value="intake">
          {bulkSelected.size > 0 && (
            <div className="mt-4 sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 shadow-sm">
              <div className="text-sm font-medium text-emerald-900">
                {bulkSelected.size} selected
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearBulkSelection}
                  disabled={bulkSubmitting}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkConfirm}
                  disabled={bulkSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {bulkSubmitting
                    ? "Adding..."
                    : `Confirm SB Spreadsheet Addition (Temp role) — ${bulkSelected.size}`}
                </Button>
              </div>
            </div>
          )}
          {bulkResult && (
            <div
              className={`mt-2 rounded-md p-2 text-sm ${
                bulkResult.failedCount === 0
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              Added {bulkResult.succeededCount}
              {bulkResult.failedCount > 0
                ? `; ${bulkResult.failedCount} failed (still selected — try again or open the card)`
                : ""}
              .
            </div>
          )}
          <ProcessingGrid
            items={filteredIntake}
            loading={loading}
            error={error}
            emptyMessage={
              searchQuery ? "No matching signups found." : "No open signups."
            }
            keyExtractor={(c) => c.responseId}
            renderCard={(c) => (
              <IntakeCard
                card={c}
                onClick={() => {
                  setSelectedIntake(c);
                  setIntakeModalOpen(true);
                }}
                cutoffDateLabel={cutoffLabel}
                selected={bulkSelected.has(c.responseId)}
                onSelectChange={(sel) => toggleBulkSelect(c.responseId, sel)}
              />
            )}
            marginTop
          />
        </TabsContent>

        <TabsContent value="volunteers">
          <ProcessingGrid
            items={filteredVolunteers}
            loading={loading}
            error={error}
            emptyMessage={
              searchQuery
                ? "No matching volunteers found."
                : "No volunteers yet."
            }
            keyExtractor={(c) => c.groupParticipantId}
            renderCard={(c) => (
              <VolunteerCard
                card={c}
                onClick={() => {
                  setSelectedVolunteer(c);
                  setVolunteerModalOpen(true);
                }}
                cutoffDateLabel={cutoffLabel}
              />
            )}
            marginTop
          />
        </TabsContent>
      </Tabs>

      <IntakeDetailModal
        card={selectedIntake}
        open={intakeModalOpen}
        onOpenChange={setIntakeModalOpen}
        onUpdate={fetchAll}
        roleOptions={roleOptions}
        tempGroupRoleId={tempGroupRoleId}
        cutoffDateLabel={cutoffLabel}
      />
      <VolunteerDetailModal
        card={selectedVolunteer}
        open={volunteerModalOpen}
        onOpenChange={setVolunteerModalOpen}
        onUpdate={fetchAll}
        cutoffDateLabel={cutoffLabel}
      />
    </div>
  );
}
