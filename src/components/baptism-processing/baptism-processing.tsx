"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaptismCard as BaptismCardData } from "@/lib/dto";
import { ProcessingGrid, ProcessingSearchBar } from "@/components/processing";
import { BaptismCard } from "./baptism-card";
import { BaptismDetailModal } from "./baptism-detail-modal";
import { getCurrentApplicants, getPausedApplicants } from "./actions";
import { filterByName } from "@/lib/processing-utils";

export function BaptismProcessing({ initialApplicantId }: { initialApplicantId?: number | null }) {
  const [activeTab, setActiveTab] = useState("current");
  const [currentApplicants, setCurrentApplicants] = useState<BaptismCardData[]>([]);
  const [pausedApplicants, setPausedApplicants] = useState<BaptismCardData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApplicant, setSelectedApplicant] = useState<BaptismCardData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [currentData, pausedData] = await Promise.all([
        getCurrentApplicants(),
        getPausedApplicants(),
      ]);
      setCurrentApplicants(currentData);
      setPausedApplicants(pausedData);
    } catch (err) {
      console.error("Failed to fetch baptism applicants:", err);
      setError("Failed to load applicants. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Auto-open modal when navigating via deep link
  useEffect(() => {
    if (!initialApplicantId || hasAutoOpened || loading) return;

    const currentMatch = currentApplicants.find(
      a => a.info.Group_Participant_ID === initialApplicantId
    );
    if (currentMatch) {
      setSelectedApplicant(currentMatch);
      setModalOpen(true);
      setHasAutoOpened(true);
      return;
    }

    const pausedMatch = pausedApplicants.find(
      a => a.info.Group_Participant_ID === initialApplicantId
    );
    if (pausedMatch) {
      setActiveTab("paused");
      setSelectedApplicant(pausedMatch);
      setModalOpen(true);
      setHasAutoOpened(true);
      return;
    }

    // Both tabs loaded but no match found
    setHasAutoOpened(true);
  }, [initialApplicantId, currentApplicants, pausedApplicants, loading, hasAutoOpened]);

  const handleCardClick = (applicant: BaptismCardData) => {
    setSelectedApplicant(applicant);
    setModalOpen(true);
  };

  const handleUpdate = () => {
    fetchAllData();
  };

  const filteredCurrent = useMemo(
    () => filterByName(currentApplicants, searchQuery),
    [currentApplicants, searchQuery]
  );

  const filteredPaused = useMemo(
    () => filterByName(pausedApplicants, searchQuery),
    [pausedApplicants, searchQuery]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Baptism Processing</h1>
        <p className="text-muted-foreground">
          Track baptism applicant progress through the baptism journey.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList className="w-full sm:w-fit h-auto">
            <TabsTrigger value="current" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
              Current Baptism Applicants
              {currentApplicants.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                  {currentApplicants.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="paused" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
              Paused Baptism Applicants
              {pausedApplicants.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                  {pausedApplicants.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>

        <TabsContent value="current">
          <ProcessingGrid
            items={filteredCurrent}
            loading={loading}
            error={error}
            emptyMessage={searchQuery ? "No matching applicants found." : "No current baptism applicants."}
            keyExtractor={(a) => a.info.Group_Participant_ID ?? a.info.Participant_ID}
            renderCard={(applicant) => (
              <BaptismCard applicant={applicant} onClick={() => handleCardClick(applicant)} />
            )}
            marginTop
          />
        </TabsContent>

        <TabsContent value="paused">
          <ProcessingGrid
            items={filteredPaused}
            loading={loading}
            error={error}
            emptyMessage={searchQuery ? "No matching applicants found." : "No paused baptism applicants."}
            keyExtractor={(a) => a.info.Group_Participant_ID ?? a.info.Participant_ID}
            renderCard={(applicant) => (
              <BaptismCard applicant={applicant} onClick={() => handleCardClick(applicant)} />
            )}
            marginTop
          />
        </TabsContent>
      </Tabs>

      <BaptismDetailModal
        applicant={selectedApplicant}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onUpdate={handleUpdate}
        isCurrentTab={activeTab === "current"}
      />
    </div>
  );
}
