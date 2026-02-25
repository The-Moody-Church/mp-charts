"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VolunteerCard as VolunteerCardData, GroupFilterOption } from "@/lib/dto";
import { ProcessingGrid } from "@/components/processing";
import { VolunteerCard } from "./volunteer-card";
import { VolunteerDetailModal } from "./volunteer-detail-modal";
import { getInProcessVolunteers, getApprovedVolunteers } from "./actions";

export function VolunteerProcessing({ initialVolunteerId }: { initialVolunteerId?: number | null }) {
  const [activeTab, setActiveTab] = useState("in-process");
  const [inProcessVolunteers, setInProcessVolunteers] = useState<VolunteerCardData[]>([]);
  const [approvedVolunteers, setApprovedVolunteers] = useState<VolunteerCardData[]>([]);
  const [approvedGroups, setApprovedGroups] = useState<GroupFilterOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVolunteer, setSelectedVolunteer] = useState<VolunteerCardData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const fetchData = useCallback(async (tab: string) => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "in-process") {
        const data = await getInProcessVolunteers();
        setInProcessVolunteers(data);
      } else {
        const result = await getApprovedVolunteers();
        setApprovedVolunteers(result.volunteers);
        setApprovedGroups(result.groups);
      }
    } catch (err) {
      console.error("Failed to fetch volunteers:", err);
      setError("Failed to load volunteers. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  // Auto-open modal when navigating via deep link
  useEffect(() => {
    if (!initialVolunteerId || hasAutoOpened || loading) return;

    // Search in-process volunteers first
    const inProcessMatch = inProcessVolunteers.find(
      v => v.info.Group_Participant_ID === initialVolunteerId
    );
    if (inProcessMatch) {
      setSelectedVolunteer(inProcessMatch);
      setModalOpen(true);
      setHasAutoOpened(true);
      return;
    }

    // Search approved volunteers (may already be loaded)
    const approvedMatch = approvedVolunteers.find(
      v => v.info.Group_Participant_ID === initialVolunteerId
    );
    if (approvedMatch) {
      setActiveTab("approved");
      setSelectedVolunteer(approvedMatch);
      setModalOpen(true);
      setHasAutoOpened(true);
      return;
    }

    // If in-process loaded but no match anywhere, try fetching approved tab
    if (inProcessVolunteers.length >= 0 && approvedVolunteers.length === 0) {
      getApprovedVolunteers().then(result => {
        setApprovedVolunteers(result.volunteers);
        setApprovedGroups(result.groups);
        const match = result.volunteers.find(
          v => v.info.Group_Participant_ID === initialVolunteerId
        );
        if (match) {
          setActiveTab("approved");
          setSelectedVolunteer(match);
          setModalOpen(true);
        }
        setHasAutoOpened(true);
      }).catch(() => setHasAutoOpened(true));
    } else {
      setHasAutoOpened(true);
    }
  }, [initialVolunteerId, inProcessVolunteers, approvedVolunteers, loading, hasAutoOpened]);

  const handleCardClick = (volunteer: VolunteerCardData) => {
    setSelectedVolunteer(volunteer);
    setModalOpen(true);
  };

  const handleUpdate = () => {
    fetchData(activeTab);
  };

  const filteredApprovedVolunteers = useMemo(() => {
    if (!selectedGroupId) return approvedVolunteers;
    return approvedVolunteers.filter(v => v.groupIds.includes(selectedGroupId));
  }, [approvedVolunteers, selectedGroupId]);

  const currentVolunteers = activeTab === "in-process" ? inProcessVolunteers : filteredApprovedVolunteers;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Volunteer Processing</h1>
        <p className="text-muted-foreground">
          Track volunteer onboarding progress and manage approved volunteers.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-fit h-auto">
          <TabsTrigger value="in-process" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
            New Volunteers In Process
            {inProcessVolunteers.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {inProcessVolunteers.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="flex-1 sm:flex-initial whitespace-normal sm:whitespace-nowrap text-xs sm:text-sm py-1.5">
            Approved Active Volunteers
            {approvedVolunteers.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {approvedVolunteers.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in-process">
          <ProcessingGrid
            items={currentVolunteers}
            loading={loading && activeTab === "in-process"}
            error={error}
            emptyMessage="No volunteers currently in process."
            keyExtractor={(v) => v.info.Group_Participant_ID}
            renderCard={(volunteer) => (
              <VolunteerCard volunteer={volunteer} onClick={() => handleCardClick(volunteer)} />
            )}
            marginTop
          />
        </TabsContent>

        <TabsContent value="approved">
          {approvedGroups.length > 1 && (
            <div className="flex items-center gap-2 mb-2">
              <label htmlFor="group-filter" className="text-sm font-medium text-gray-700">
                Filter by group:
              </label>
              <select
                id="group-filter"
                value={selectedGroupId ?? ""}
                onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : null)}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">All Groups ({approvedVolunteers.length})</option>
                {approvedGroups.map((group) => {
                  const count = approvedVolunteers.filter(v => v.groupIds.includes(group.Group_ID)).length;
                  return (
                    <option key={group.Group_ID} value={group.Group_ID}>
                      {group.Group_Name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          <ProcessingGrid
            items={currentVolunteers}
            loading={loading && activeTab === "approved"}
            error={error}
            emptyMessage="No approved volunteers found."
            keyExtractor={(v) => v.info.Group_Participant_ID}
            renderCard={(volunteer) => (
              <VolunteerCard volunteer={volunteer} onClick={() => handleCardClick(volunteer)} />
            )}
            marginTop
          />
        </TabsContent>
      </Tabs>

      <VolunteerDetailModal
        volunteer={selectedVolunteer}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onUpdate={handleUpdate}
        approvedGroups={approvedGroups}
        isInProcessTab={activeTab === "in-process"}
      />
    </div>
  );
}
