"use client";

import React, { useEffect, useState, useCallback } from "react";
import { MembershipCard as MembershipCardData } from "@/lib/dto";
import { MembershipCard } from "./membership-card";
import { MembershipDetailModal } from "./membership-detail-modal";
import { getApplicants } from "./actions";

export function MembershipProcessing({ initialApplicantId }: { initialApplicantId?: number | null }) {
  const [applicants, setApplicants] = useState<MembershipCardData[]>([]);
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

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Membership Processing</h1>
          {applicants.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium">
              {applicants.length}
            </span>
          )}
        </div>
        <p className="text-muted-foreground">
          Track membership application progress and manage milestones.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading applicants...
        </div>
      ) : error ? (
        <div className="py-8 text-center text-red-500 bg-red-50 rounded-md">
          {error}
        </div>
      ) : applicants.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No membership applicants found.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {applicants.map((applicant) => (
            <MembershipCard
              key={applicant.info.Group_Participant_ID}
              applicant={applicant}
              onClick={() => handleCardClick(applicant)}
            />
          ))}
        </div>
      )}

      <MembershipDetailModal
        applicant={selectedApplicant}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onUpdate={fetchData}
      />
    </div>
  );
}
