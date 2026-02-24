"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaptismCard as BaptismCardData } from "@/lib/dto";
import { ProcessingGrid } from "@/components/processing";
import { BaptismCard } from "./baptism-card";
import { BaptismDetailModal } from "./baptism-detail-modal";
import { getCurrentApplicants, getPausedApplicants } from "./actions";

export function BaptismProcessing({ initialApplicantId }: { initialApplicantId?: number | null }) {
  const [activeTab, setActiveTab] = useState("current");
  const [currentApplicants, setCurrentApplicants] = useState<BaptismCardData[]>([]);
  const [pausedApplicants, setPausedApplicants] = useState<BaptismCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApplicant, setSelectedApplicant] = useState<BaptismCardData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const fetchData = useCallback(async (tab: string) => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "current") {
        const data = await getCurrentApplicants();
        setCurrentApplicants(data);
      } else {
        const data = await getPausedApplicants();
        setPausedApplicants(data);
      }
    } catch (err) {
      console.error("Failed to fetch baptism applicants:", err);
      setError("Failed to load applicants. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab, fetchData]);

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

    // If current loaded but no match, try fetching paused tab
    if (currentApplicants.length >= 0 && pausedApplicants.length === 0) {
      getPausedApplicants().then(data => {
        setPausedApplicants(data);
        const match = data.find(
          a => a.info.Group_Participant_ID === initialApplicantId
        );
        if (match) {
          setActiveTab("paused");
          setSelectedApplicant(match);
          setModalOpen(true);
        }
        setHasAutoOpened(true);
      }).catch(() => setHasAutoOpened(true));
    } else {
      setHasAutoOpened(true);
    }
  }, [initialApplicantId, currentApplicants, pausedApplicants, loading, hasAutoOpened]);

  const handleCardClick = (applicant: BaptismCardData) => {
    setSelectedApplicant(applicant);
    setModalOpen(true);
  };

  const handleUpdate = () => {
    fetchData(activeTab);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Baptism Processing</h1>
        <p className="text-muted-foreground">
          Track baptism applicant progress through the baptism journey.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="current">
            Current Baptism Applicants
            {currentApplicants.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {currentApplicants.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="paused">
            Paused Baptism Applicants
            {pausedApplicants.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {pausedApplicants.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current">
          <ProcessingGrid
            items={currentApplicants}
            loading={loading && activeTab === "current"}
            error={error}
            emptyMessage="No current baptism applicants."
            keyExtractor={(a) => a.info.Group_Participant_ID}
            renderCard={(applicant) => (
              <BaptismCard applicant={applicant} onClick={() => handleCardClick(applicant)} />
            )}
            marginTop
          />
        </TabsContent>

        <TabsContent value="paused">
          <ProcessingGrid
            items={pausedApplicants}
            loading={loading && activeTab === "paused"}
            error={error}
            emptyMessage="No paused baptism applicants."
            keyExtractor={(a) => a.info.Group_Participant_ID}
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
