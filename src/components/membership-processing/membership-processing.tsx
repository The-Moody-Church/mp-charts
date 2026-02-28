"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { MembershipCard as MembershipCardData } from "@/lib/dto";
import { ProcessingGrid, ProcessingSearchBar } from "@/components/processing";
import { MembershipCard } from "./membership-card";
import { MembershipDetailModal } from "./membership-detail-modal";
import { getApplicants } from "./actions";
import { filterByName } from "@/lib/processing-utils";

export function MembershipProcessing({ initialApplicantId }: { initialApplicantId?: number | null }) {
  const [applicants, setApplicants] = useState<MembershipCardData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApplicant, setSelectedApplicant] = useState<MembershipCardData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getApplicants();
      setApplicants(data);
    } catch (err) {
      console.error("Failed to fetch applicants:", err);
      setError("Failed to load membership applicants. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-open modal when navigating via deep link
  useEffect(() => {
    if (!initialApplicantId || hasAutoOpened || loading) return;

    const match = applicants.find(
      a => a.info.Group_Participant_ID === initialApplicantId
    );
    if (match) {
      setSelectedApplicant(match);
      setModalOpen(true);
    }
    setHasAutoOpened(true);
  }, [initialApplicantId, applicants, loading, hasAutoOpened]);

  const handleCardClick = (applicant: MembershipCardData) => {
    setSelectedApplicant(applicant);
    setModalOpen(true);
  };

  const filteredApplicants = useMemo(
    () => filterByName(applicants, searchQuery),
    [applicants, searchQuery]
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Membership Processing</h1>
            {applicants.length > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium">
                {applicants.length}
              </span>
            )}
          </div>
          <ProcessingSearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
        <p className="text-muted-foreground">
          Track membership application progress and manage milestones.
        </p>
      </div>

      <ProcessingGrid
        items={filteredApplicants}
        loading={loading}
        error={error}
        emptyMessage={searchQuery ? "No matching applicants found." : "No membership applicants found."}
        keyExtractor={(a) => a.info.Group_Participant_ID ?? a.info.Participant_ID}
        renderCard={(applicant) => (
          <MembershipCard
            applicant={applicant}
            onClick={() => handleCardClick(applicant)}
          />
        )}
      />

      <MembershipDetailModal
        applicant={selectedApplicant}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onUpdate={fetchData}
      />
    </div>
  );
}
