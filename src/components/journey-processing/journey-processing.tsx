"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JourneyCard as JourneyCardData } from "@/lib/dto";
import { ProcessingGrid, ProcessingSearchBar } from "@/components/processing";
import { JourneyCard } from "./journey-card";
import { JourneyDetailModal } from "./journey-detail-modal";
import { getJourneyParticipants, getCompletedJourneyParticipants, getPausedJourneyParticipants } from "./actions";
import { searchByName } from "@/lib/processing-utils";
import type { JourneyToolConfig } from "@/lib/journey-tools-config-types";

interface JourneyProcessingProps {
  slug: string;
  config: JourneyToolConfig;
  initialApplicantId?: number | null;
}

export function JourneyProcessing({ slug, config, initialApplicantId }: JourneyProcessingProps) {
  const isMilestoneMode = !config.trackingGroupId;
  const hasPause = !isMilestoneMode && config.supportsPause && !!config.pausedGroupId;
  const hasTabs = isMilestoneMode || hasPause;

  const [activeTab, setActiveTab] = useState(isMilestoneMode ? "in-progress" : "current");
  const [currentParticipants, setCurrentParticipants] = useState<JourneyCardData[]>([]);
  const [completedParticipants, setCompletedParticipants] = useState<JourneyCardData[]>([]);
  const [pausedParticipants, setPausedParticipants] = useState<JourneyCardData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<JourneyCardData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isMilestoneMode) {
        const [inProgress, completed] = await Promise.all([
          getJourneyParticipants(slug),
          getCompletedJourneyParticipants(slug),
        ]);
        setCurrentParticipants(inProgress);
        setCompletedParticipants(completed);
      } else {
        const fetches: Promise<JourneyCardData[]>[] = [getJourneyParticipants(slug)];
        if (hasPause) {
          fetches.push(getPausedJourneyParticipants(slug));
        }
        const results = await Promise.all(fetches);
        setCurrentParticipants(results[0]);
        if (hasPause && results[1]) {
          setPausedParticipants(results[1]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch journey participants:", err);
      setError("Failed to load participants. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [slug, hasPause, isMilestoneMode]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Auto-open modal when navigating via deep link
  useEffect(() => {
    if (!initialApplicantId || hasAutoOpened || loading) return;

    // In milestone mode, match on Participant_ID; in group mode, match on Group_Participant_ID
    const matchFn = isMilestoneMode
      ? (a: JourneyCardData) => a.info.Participant_ID === initialApplicantId
      : (a: JourneyCardData) => a.info.Group_Participant_ID === initialApplicantId;

    const currentMatch = currentParticipants.find(matchFn);
    if (currentMatch) {
      setSelectedParticipant(currentMatch);
      setModalOpen(true);
      setHasAutoOpened(true);
      return;
    }

    if (isMilestoneMode) {
      const completedMatch = completedParticipants.find(matchFn);
      if (completedMatch) {
        setActiveTab("completed");
        setSelectedParticipant(completedMatch);
        setModalOpen(true);
        setHasAutoOpened(true);
        return;
      }
    } else if (hasPause) {
      const pausedMatch = pausedParticipants.find(matchFn);
      if (pausedMatch) {
        setActiveTab("paused");
        setSelectedParticipant(pausedMatch);
        setModalOpen(true);
        setHasAutoOpened(true);
        return;
      }
    }

    setHasAutoOpened(true);
  }, [initialApplicantId, currentParticipants, completedParticipants, pausedParticipants, loading, hasAutoOpened, hasPause, isMilestoneMode]);

  const handleCardClick = (participant: JourneyCardData) => {
    setSelectedParticipant(participant);
    setModalOpen(true);
  };

  const handleUpdate = () => {
    fetchAllData();
  };

  const filteredCurrent = useMemo(
    () => searchByName(currentParticipants, searchQuery),
    [currentParticipants, searchQuery]
  );

  const filteredCompleted = useMemo(
    () => searchByName(completedParticipants, searchQuery),
    [completedParticipants, searchQuery]
  );

  const filteredPaused = useMemo(
    () => searchByName(pausedParticipants, searchQuery),
    [pausedParticipants, searchQuery]
  );

  const keyExtractor = (a: JourneyCardData) => a.info.Group_Participant_ID ?? a.info.Participant_ID;

  const modal = (
    <JourneyDetailModal
      slug={slug}
      participant={selectedParticipant}
      open={modalOpen}
      onOpenChange={setModalOpen}
      onUpdate={handleUpdate}
      isCurrentTab={isMilestoneMode ? activeTab === "in-progress" : activeTab === "current"}
      supportsPause={hasPause}
      journeyName={config.journeyName}
    />
  );

  // Single grid (group mode, no pause, no milestone mode)
  if (!hasTabs) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{config.journeyName}</h1>
          <p className="text-muted-foreground">{config.description}</p>
        </div>

        <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />

        <ProcessingGrid
          items={filteredCurrent}
          loading={loading}
          error={error}
          emptyMessage={searchQuery ? "No matching participants found." : "No participants."}
          keyExtractor={keyExtractor}
          renderCard={(participant) => (
            <JourneyCard participant={participant} onClick={() => handleCardClick(participant)} />
          )}
          marginTop
        />

        {modal}
      </div>
    );
  }

  // Tabbed layout (milestone mode: In Progress/Completed, group mode: Current/Paused)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{config.journeyName}</h1>
        <p className="text-muted-foreground">{config.description}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList className="w-full sm:w-fit h-auto">
            {isMilestoneMode ? (
              <>
                <TabsTrigger value="in-progress" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
                  In Progress
                  {currentParticipants.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                      {currentParticipants.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="completed" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
                  Completed
                  {completedParticipants.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                      {completedParticipants.length}
                    </span>
                  )}
                </TabsTrigger>
              </>
            ) : (
              <>
                <TabsTrigger value="current" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
                  Current
                  {currentParticipants.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                      {currentParticipants.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="paused" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
                  Paused
                  {pausedParticipants.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                      {pausedParticipants.length}
                    </span>
                  )}
                </TabsTrigger>
              </>
            )}
          </TabsList>
          <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>

        {isMilestoneMode ? (
          <>
            <TabsContent value="in-progress">
              <ProcessingGrid
                items={filteredCurrent}
                loading={loading}
                error={error}
                emptyMessage={searchQuery ? "No matching participants found." : "No participants in progress."}
                keyExtractor={keyExtractor}
                renderCard={(participant) => (
                  <JourneyCard participant={participant} onClick={() => handleCardClick(participant)} />
                )}
                marginTop
              />
            </TabsContent>

            <TabsContent value="completed">
              <ProcessingGrid
                items={filteredCompleted}
                loading={loading}
                error={error}
                emptyMessage={searchQuery ? "No matching participants found." : "No completed participants."}
                keyExtractor={keyExtractor}
                renderCard={(participant) => (
                  <JourneyCard participant={participant} onClick={() => handleCardClick(participant)} />
                )}
                marginTop
              />
            </TabsContent>
          </>
        ) : (
          <>
            <TabsContent value="current">
              <ProcessingGrid
                items={filteredCurrent}
                loading={loading}
                error={error}
                emptyMessage={searchQuery ? "No matching participants found." : "No current participants."}
                keyExtractor={keyExtractor}
                renderCard={(participant) => (
                  <JourneyCard participant={participant} onClick={() => handleCardClick(participant)} />
                )}
                marginTop
              />
            </TabsContent>

            <TabsContent value="paused">
              <ProcessingGrid
                items={filteredPaused}
                loading={loading}
                error={error}
                emptyMessage={searchQuery ? "No matching participants found." : "No paused participants."}
                keyExtractor={keyExtractor}
                renderCard={(participant) => (
                  <JourneyCard participant={participant} onClick={() => handleCardClick(participant)} />
                )}
                marginTop
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      {modal}
    </div>
  );
}
