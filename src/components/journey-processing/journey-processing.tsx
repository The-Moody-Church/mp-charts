"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JourneyCard as JourneyCardData } from "@/lib/dto";
import { ProcessingGrid, ProcessingSearchBar, ProcessingSortSelect } from "@/components/processing";
import { JourneyCard } from "./journey-card";
import { JourneyDetailModal } from "./journey-detail-modal";
import { getJourneyParticipants, getCompletedJourneyParticipants, getPausedJourneyParticipants } from "./actions";
import { searchByName, sortCards, type ProcessingSortOption } from "@/lib/processing-utils";
import type { JourneyToolConfig } from "@/lib/journey-tools-config-types";

interface JourneyProcessingProps {
  slug: string;
  config: JourneyToolConfig;
  initialApplicantId?: number | null;
}

/**
 * The lists one load produced. `completed` and `paused` are absent — not empty —
 * when the current mode doesn't query them, so applying the result never writes a
 * list this mode never reads.
 */
interface LoadedParticipants {
  current: JourneyCardData[];
  completed?: JourneyCardData[];
  paused?: JourneyCardData[];
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
  const [sortOption, setSortOption] = useState<ProcessingSortOption>("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<JourneyCardData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Per-open remount counter for the detail modal — see openParticipant below.
  const [modalSession, setModalSession] = useState(0);

  // One-shot latch for the deep link. A ref, not state, because nothing renders
  // from it and it must not participate in the render cycle it used to drive.
  const hasAutoOpenedRef = useRef(false);

  // Every open goes through here, so "an open is always a fresh mount" holds
  // unconditionally rather than by argument. The bumped counter is the modal's
  // `key`: keying on the participant id instead would not change when the SAME
  // participant is reopened (this component keeps `selectedParticipant` set after
  // close so Radix can animate out), and the modal's refetch would silently stop —
  // staff edit milestones directly in MP and expect current data.
  const openParticipant = useCallback((participant: JourneyCardData) => {
    setSelectedParticipant(participant);
    setModalSession((n) => n + 1);
    setModalOpen(true);
  }, []);

  // Pure fetch — returns the lists and touches no state, so it is safe to call
  // from an effect body. The initial `loading: true` comes from the useState
  // initialiser above, so the mount path never sets it synchronously.
  const loadAllData = useCallback(async (): Promise<LoadedParticipants> => {
    if (isMilestoneMode) {
      const [inProgress, completed] = await Promise.all([
        getJourneyParticipants(slug),
        getCompletedJourneyParticipants(slug),
      ]);
      return { current: inProgress, completed };
    }
    const fetches: Promise<JourneyCardData[]>[] = [getJourneyParticipants(slug)];
    if (hasPause) {
      fetches.push(getPausedJourneyParticipants(slug));
    }
    const results = await Promise.all(fetches);
    return hasPause && results[1]
      ? { current: results[0], paused: results[1] }
      : { current: results[0] };
  }, [slug, hasPause, isMilestoneMode]);

  const applyData = useCallback(
    (data: LoadedParticipants) => {
      setCurrentParticipants(data.current);
      if (data.completed !== undefined) setCompletedParticipants(data.completed);
      if (data.paused !== undefined) setPausedParticipants(data.paused);
      setLoading(false);

      // Deep-link auto-open, once, off the first successful load. Reads the
      // resolved lists directly instead of waiting for them to come back through
      // a render. Latched even when nothing matched, which is what the old
      // `setHasAutoOpened(true)` fall-through did; a FAILED load never reaches
      // here, so a transient MP error no longer burns the link.
      if (hasAutoOpenedRef.current || !initialApplicantId) return;
      hasAutoOpenedRef.current = true;

      // Milestone mode matches on Participant_ID; group mode on Group_Participant_ID.
      const matchFn = isMilestoneMode
        ? (a: JourneyCardData) => a.info.Participant_ID === initialApplicantId
        : (a: JourneyCardData) => a.info.Group_Participant_ID === initialApplicantId;

      const currentMatch = data.current.find(matchFn);
      if (currentMatch) {
        openParticipant(currentMatch);
        return;
      }

      if (isMilestoneMode) {
        const completedMatch = data.completed?.find(matchFn);
        if (completedMatch) {
          // Before the open, so `isCurrentTab` gives the modal the right action set.
          setActiveTab("completed");
          openParticipant(completedMatch);
        }
        return;
      }

      const pausedMatch = data.paused?.find(matchFn);
      if (pausedMatch) {
        setActiveTab("paused");
        openParticipant(pausedMatch);
      }
    },
    [initialApplicantId, isMilestoneMode, openParticipant]
  );

  const handleLoadError = useCallback((err: unknown) => {
    console.error("Failed to fetch journey participants:", err);
    setError("Failed to load participants. Please try again.");
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAllData()
      .then((data) => {
        if (!cancelled) applyData(data);
      })
      .catch((err) => {
        if (!cancelled) handleLoadError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAllData, applyData, handleLoadError]);

  // Event-handler refresh after a write in the modal. setState is unrestricted
  // here, so unlike the mount path this one puts the grids back into loading.
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyData(await loadAllData());
    } catch (err) {
      handleLoadError(err);
    }
  }, [loadAllData, applyData, handleLoadError]);

  const filteredCurrent = useMemo(
    () => sortCards(searchByName(currentParticipants, searchQuery), sortOption),
    [currentParticipants, searchQuery, sortOption]
  );

  const filteredCompleted = useMemo(
    () => sortCards(searchByName(completedParticipants, searchQuery), sortOption),
    [completedParticipants, searchQuery, sortOption]
  );

  const filteredPaused = useMemo(
    () => sortCards(searchByName(pausedParticipants, searchQuery), sortOption),
    [pausedParticipants, searchQuery, sortOption]
  );

  const keyExtractor = (a: JourneyCardData) => a.info.Group_Participant_ID ?? a.info.Participant_ID;

  const modal = (
    <JourneyDetailModal
      key={modalSession}
      slug={slug}
      participant={selectedParticipant}
      open={modalOpen}
      onOpenChange={setModalOpen}
      onUpdate={refresh}
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

        <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
          <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />
          <ProcessingSortSelect value={sortOption} onChange={setSortOption} />
        </div>

        <ProcessingGrid
          items={filteredCurrent}
          loading={loading}
          error={error}
          emptyMessage={searchQuery ? "No matching participants found." : "No participants."}
          keyExtractor={keyExtractor}
          renderCard={(participant) => (
            <JourneyCard participant={participant} onClick={() => openParticipant(participant)} />
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
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-fit">
            <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />
            <ProcessingSortSelect value={sortOption} onChange={setSortOption} />
          </div>
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
                  <JourneyCard participant={participant} onClick={() => openParticipant(participant)} />
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
                  <JourneyCard participant={participant} onClick={() => openParticipant(participant)} />
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
                  <JourneyCard participant={participant} onClick={() => openParticipant(participant)} />
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
                  <JourneyCard participant={participant} onClick={() => openParticipant(participant)} />
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
