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
  type ProcessingSortOption,
} from "@/lib/processing-utils";
import { IntakeCard } from "./intake-card";
import { VolunteerCard } from "./volunteer-card";
import { IntakeDetailModal } from "./intake-detail-modal";
import { VolunteerDetailModal } from "./volunteer-detail-modal";
import { getSummerBlastIntake, getSummerBlastVolunteers } from "./actions";
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
  const [sortOption, setSortOption] = useState<ProcessingSortOption>("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedIntake, setSelectedIntake] = useState<SummerBlastIntakeCard | null>(null);
  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [selectedVolunteer, setSelectedVolunteer] = useState<SummerBlastVolunteerCard | null>(null);
  const [volunteerModalOpen, setVolunteerModalOpen] = useState(false);

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

  const filteredIntake = useMemo(
    () => sortCards(searchByName(intake, searchQuery), sortOption),
    [intake, searchQuery, sortOption],
  );
  const filteredVolunteers = useMemo(
    () => sortCards(searchByName(volunteers, searchQuery), sortOption),
    [volunteers, searchQuery, sortOption],
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
            <ProcessingSortSelect value={sortOption} onChange={setSortOption} />
          </div>
        </div>

        <TabsContent value="intake">
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
