"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JourneyCard as JourneyCardData } from "@/lib/dto";
import { ProcessingGrid, ProcessingSearchBar } from "@/components/processing";
import { JourneyCard } from "./journey-card";
import { JourneyDetailModal } from "./journey-detail-modal";
import { getJourneyParticipants, getPausedJourneyParticipants } from "./actions";
import { filterByName } from "@/lib/processing-utils";
import type { JourneyToolConfig } from "@/lib/journey-tools-config-types";

interface JourneyProcessingProps {
  slug: string;
  config: JourneyToolConfig;
  initialApplicantId?: number | null;
}

export function JourneyProcessing({ slug, config, initialApplicantId }: JourneyProcessingProps) {
  const hasPause = config.supportsPause && !!config.pausedGroupId;
  const [activeTab, setActiveTab] = useState("current");
  const [currentParticipants, setCurrentParticipants] = useState<JourneyCardData[]>([]);
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
      const fetches: Promise<JourneyCardData[]>[] = [getJourneyParticipants(slug)];
      if (hasPause) {
        fetches.push(getPausedJourneyParticipants(slug));
      }
      const results = await Promise.all(fetches);
      setCurrentParticipants(results[0]);
      if (hasPause && results[1]) {
        setPausedParticipants(results[1]);
      }
    } catch (err) {
      console.error("Failed to fetch journey participants:", err);
      setError("Failed to load participants. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [slug, hasPause]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Auto-open modal when navigating via deep link
  useEffect(() => {
    if (!initialApplicantId || hasAutoOpened || loading) return;

    const currentMatch = currentParticipants.find(
      a => a.info.Group_Participant_ID === initialApplicantId
    );
    if (currentMatch) {
      setSelectedParticipant(currentMatch);
      setModalOpen(true);
      setHasAutoOpened(true);
      return;
    }

    if (hasPause) {
      const pausedMatch = pausedParticipants.find(
        a => a.info.Group_Participant_ID === initialApplicantId
      );
      if (pausedMatch) {
        setActiveTab("paused");
        setSelectedParticipant(pausedMatch);
        setModalOpen(true);
        setHasAutoOpened(true);
        return;
      }
    }

    setHasAutoOpened(true);
  }, [initialApplicantId, currentParticipants, pausedParticipants, loading, hasAutoOpened, hasPause]);

  const handleCardClick = (participant: JourneyCardData) => {
    setSelectedParticipant(participant);
    setModalOpen(true);
  };

  const handleUpdate = () => {
    fetchAllData();
  };

  const filteredCurrent = useMemo(
    () => filterByName(currentParticipants, searchQuery),
    [currentParticipants, searchQuery]
  );

  const filteredPaused = useMemo(
    () => filterByName(pausedParticipants, searchQuery),
    [pausedParticipants, searchQuery]
  );

  // When pause is not supported, render a single grid (no tabs)
  if (!hasPause) {
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
          keyExtractor={(a) => a.info.Group_Participant_ID}
          renderCard={(participant) => (
            <JourneyCard participant={participant} onClick={() => handleCardClick(participant)} />
          )}
          marginTop
        />

        <JourneyDetailModal
          slug={slug}
          participant={selectedParticipant}
          open={modalOpen}
          onOpenChange={setModalOpen}
          onUpdate={handleUpdate}
          isCurrentTab
          supportsPause={false}
          journeyName={config.journeyName}
        />
      </div>
    );
  }

  // When pause is supported, render tabs (current/paused)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{config.journeyName}</h1>
        <p className="text-muted-foreground">{config.description}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <TabsList className="w-full sm:w-fit h-auto">
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
          </TabsList>
          <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>

        <TabsContent value="current">
          <ProcessingGrid
            items={filteredCurrent}
            loading={loading}
            error={error}
            emptyMessage={searchQuery ? "No matching participants found." : "No current participants."}
            keyExtractor={(a) => a.info.Group_Participant_ID}
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
            keyExtractor={(a) => a.info.Group_Participant_ID}
            renderCard={(participant) => (
              <JourneyCard participant={participant} onClick={() => handleCardClick(participant)} />
            )}
            marginTop
          />
        </TabsContent>
      </Tabs>

      <JourneyDetailModal
        slug={slug}
        participant={selectedParticipant}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onUpdate={handleUpdate}
        isCurrentTab={activeTab === "current"}
        supportsPause
        journeyName={config.journeyName}
      />
    </div>
  );
}
