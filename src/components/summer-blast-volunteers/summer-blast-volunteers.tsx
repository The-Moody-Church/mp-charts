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

// Signups tab has two extra "Signup Date" options; newest-first is the default.
const INTAKE_SORT_OPTIONS: { value: ProcessingSortOption; label: string }[] = [
  { value: "signup-date-desc", label: "Signup Date (Newest)" },
  { value: "signup-date-asc", label: "Signup Date (Oldest)" },
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

interface LoadedData {
  intakeData: SummerBlastIntakeCard[];
  volunteerData: SummerBlastVolunteerCard[];
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

  // Per-open remount counters, bumped in the card click handlers and used as the
  // modals' `key`. Deliberately NOT the record id: neither `selectedIntake` nor
  // `selectedVolunteer` is cleared on close (Radix needs the record to animate
  // out), so a record-id key would not change when the SAME record is reopened —
  // the reset would silently stop happening for exactly that case, leaving a
  // stale Group_Role_ID or a pre-armed "Confirm Remove" behind.
  //
  // One counter per modal, not one shared: a shared bump would remount the other
  // modal mid-exit-animation.
  const [intakeSession, setIntakeSession] = useState(0);
  const [volunteerSession, setVolunteerSession] = useState(0);

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

  // Pure fetch — returns data and touches no state, so calling it from an effect
  // body is legal. The read deliberately stays on the client: this screen exists
  // to show real-time signups (its cache layer was removed on purpose in 4d521c2),
  // and the page's Suspense fallback is a bare line of text, so moving the read
  // into the RSC would replace the header, tabs and skeleton grid with it.
  const loadAll = useCallback(async (): Promise<LoadedData> => {
    const [intakeData, volunteerData] = await Promise.all([
      getSummerBlastIntake(),
      getSummerBlastVolunteers(),
    ]);
    return { intakeData, volunteerData };
  }, []);

  const applyData = useCallback(({ intakeData, volunteerData }: LoadedData) => {
    setIntake(intakeData);
    setVolunteers(volunteerData);
    // Drop selections for response IDs that are no longer in the intake list
    // (e.g., after a bulk add closes their Responses). Pruned here against the
    // resolved data rather than from an effect keyed on `intake` — `setIntake` has
    // no other call site, so this runs exactly when the list changes.
    //
    // Deriving `bulkSelected ∩ present` during render instead would leave the
    // stale IDs in state forever, so a re-opened Opportunity Response would come
    // back pre-checked. The prune has to be permanent.
    setBulkSelected((prev) => {
      if (prev.size === 0) return prev;
      const present = new Set(intakeData.map((c) => c.responseId));
      let changed = false;
      const next = new Set<number>();
      prev.forEach((id) => {
        if (present.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
    setLoading(false);
  }, []);

  const handleLoadError = useCallback((err: unknown) => {
    console.error("Failed to load Summer Blast data:", err);
    setError("Failed to load data. Please try again.");
    setLoading(false);
  }, []);

  // Mount load. Every setState lives in the async continuation; the initial
  // `loading: true` comes from the useState initialiser above, which is why
  // nothing has to be set synchronously here.
  useEffect(() => {
    let cancelled = false;
    loadAll()
      .then((data) => {
        if (!cancelled) applyData(data);
      })
      .catch((err) => {
        if (!cancelled) handleLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAll, applyData, handleLoadError]);

  // Event-handler refresh, called after a modal write or a bulk add. setState is
  // unrestricted here, so unlike the mount path this one puts the grids back into
  // their loading state first.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyData(await loadAll());
    } catch (err) {
      handleLoadError(err);
    }
  }, [loadAll, applyData, handleLoadError]);

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
        await refresh(); // succeeded IDs leave the intake list; applyData prunes them from the selection. Failed IDs remain selected so the user can retry.
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
                  setIntakeSession((n) => n + 1);
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
                  setVolunteerSession((n) => n + 1);
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
        key={intakeSession}
        card={selectedIntake}
        open={intakeModalOpen}
        onOpenChange={setIntakeModalOpen}
        onUpdate={refresh}
        roleOptions={roleOptions}
        tempGroupRoleId={tempGroupRoleId}
        cutoffDateLabel={cutoffLabel}
      />
      <VolunteerDetailModal
        key={volunteerSession}
        card={selectedVolunteer}
        open={volunteerModalOpen}
        onOpenChange={setVolunteerModalOpen}
        onUpdate={refresh}
        cutoffDateLabel={cutoffLabel}
      />
    </div>
  );
}
