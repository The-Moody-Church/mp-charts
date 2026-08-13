"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComplianceCard as ComplianceCardData } from "@/lib/dto";
import { ProcessingGrid, ProcessingSearchBar, ProcessingSortSelect } from "@/components/processing";
import { ComplianceCard } from "./compliance-card";
import { ComplianceDetailModal } from "./compliance-detail-modal";
import { getComplianceParticipants, getPausedComplianceParticipants } from "./actions";
import { searchByName, sortCards, type ProcessingSortOption } from "@/lib/processing-utils";
import type { ComplianceToolConfig } from "@/lib/compliance-tools-config-types";

interface ComplianceProcessingProps {
  slug: string;
  config: ComplianceToolConfig;
  initialApplicantId?: number | null;
}

/**
 * The lists one load produced. `paused` is absent — not empty — when pause is not
 * configured, so applying the result never writes a list this tool never reads.
 */
interface LoadedParticipants {
  current: ComplianceCardData[];
  paused?: ComplianceCardData[];
}

export function ComplianceProcessing({ slug, config, initialApplicantId }: ComplianceProcessingProps) {
  const hasPause = config.supportsPause && !!config.pausedGroupId;
  const [activeTab, setActiveTab] = useState("current");
  const [currentParticipants, setCurrentParticipants] = useState<ComplianceCardData[]>([]);
  const [pausedParticipants, setPausedParticipants] = useState<ComplianceCardData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<ProcessingSortOption>("name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] = useState<ComplianceCardData | null>(null);
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
  const openParticipant = useCallback((participant: ComplianceCardData) => {
    setSelectedParticipant(participant);
    setModalSession((n) => n + 1);
    setModalOpen(true);
  }, []);

  // Pure fetch — returns the lists and touches no state, so it is safe to call
  // from an effect body. The initial `loading: true` comes from the useState
  // initialiser above, so the mount path never sets it synchronously.
  const loadAllData = useCallback(async (): Promise<LoadedParticipants> => {
    const fetches: Promise<ComplianceCardData[]>[] = [getComplianceParticipants(slug)];
    if (hasPause) {
      fetches.push(getPausedComplianceParticipants(slug));
    }
    const results = await Promise.all(fetches);
    return hasPause && results[1]
      ? { current: results[0], paused: results[1] }
      : { current: results[0] };
  }, [slug, hasPause]);

  const applyData = useCallback(
    (data: LoadedParticipants) => {
      setCurrentParticipants(data.current);
      if (data.paused !== undefined) setPausedParticipants(data.paused);
      setLoading(false);

      // Deep-link auto-open, once, off the first successful load. Reads the
      // resolved lists directly instead of waiting for them to come back through
      // a render. Latched even when nothing matched, which is what the old
      // `setHasAutoOpened(true)` fall-through did; a FAILED load never reaches
      // here, so a transient MP error no longer burns the link.
      if (hasAutoOpenedRef.current || !initialApplicantId) return;
      hasAutoOpenedRef.current = true;

      const matchFn = (a: ComplianceCardData) =>
        a.info.Group_Participant_ID === initialApplicantId;

      const currentMatch = data.current.find(matchFn);
      if (currentMatch) {
        openParticipant(currentMatch);
        return;
      }

      const pausedMatch = data.paused?.find(matchFn);
      if (pausedMatch) {
        // Before the open, so `isCurrentTab` gives the modal the right action set.
        // Offering "Pause" where "Resume" belongs is a wrong-write against MP.
        setActiveTab("paused");
        openParticipant(pausedMatch);
      }
    },
    [initialApplicantId, openParticipant]
  );

  const handleLoadError = useCallback((err: unknown) => {
    console.error("Failed to fetch compliance participants:", err);
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

  const filteredPaused = useMemo(
    () => sortCards(searchByName(pausedParticipants, searchQuery), sortOption),
    [pausedParticipants, searchQuery, sortOption]
  );

  // One declaration for both render branches so the key can't diverge between them.
  // isCurrentTab is unconditionally true without tabs — there is only one list.
  const modal = (
    <ComplianceDetailModal
      key={modalSession}
      slug={slug}
      participant={selectedParticipant}
      open={modalOpen}
      onOpenChange={setModalOpen}
      onUpdate={refresh}
      isCurrentTab={hasPause ? activeTab === "current" : true}
      supportsPause={hasPause}
      toolName={config.toolName}
    />
  );

  // When pause is not supported, render a single grid (no tabs)
  if (!hasPause) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{config.toolName}</h1>
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
          keyExtractor={(a) => a.info.Group_Participant_ID ?? a.info.Participant_ID}
          renderCard={(participant) => (
            <ComplianceCard participant={participant} onClick={() => openParticipant(participant)} />
          )}
          marginTop
        />

        {modal}
      </div>
    );
  }

  // When pause is supported, render tabs (current/paused)
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{config.toolName}</h1>
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
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-fit">
            <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />
            <ProcessingSortSelect value={sortOption} onChange={setSortOption} />
          </div>
        </div>

        <TabsContent value="current">
          <ProcessingGrid
            items={filteredCurrent}
            loading={loading}
            error={error}
            emptyMessage={searchQuery ? "No matching participants found." : "No current participants."}
            keyExtractor={(a) => a.info.Group_Participant_ID ?? a.info.Participant_ID}
            renderCard={(participant) => (
              <ComplianceCard participant={participant} onClick={() => openParticipant(participant)} />
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
            keyExtractor={(a) => a.info.Group_Participant_ID ?? a.info.Participant_ID}
            renderCard={(participant) => (
              <ComplianceCard participant={participant} onClick={() => openParticipant(participant)} />
            )}
            marginTop
          />
        </TabsContent>
      </Tabs>

      {modal}
    </div>
  );
}
