"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberTabs } from "./member-tabs";
import { MemberCardComponent } from "./member-card";
import { TransitionDialog } from "./transition-dialog";
import { fetchMembers, fetchStatusCounts } from "./actions";
import { MEMBER_STATUS_GROUPS, MEMBERS_PAGE_SIZE } from "@/lib/dto";
import type { MemberCard, MemberStatusGroup } from "@/lib/dto";

interface ManageMembersShellProps {
  initialMembers: MemberCard[];
  initialCounts: Record<string, number>;
  initialStatuses: { Member_Status_ID: number; Member_Status: string }[];
}

function buildGroups(
  counts: Record<string, number>,
): MemberStatusGroup[] {
  return MEMBER_STATUS_GROUPS.map((g) => {
    let count = 0;
    for (const id of g.statusIds) {
      const key = id === null ? "null" : String(id);
      count += counts[key] || 0;
    }
    return { ...g, count };
  });
}

export function ManageMembersShell({
  initialMembers,
  initialCounts,
  initialStatuses,
}: ManageMembersShellProps) {
  const mpFileUrl = process.env.NEXT_PUBLIC_MINISTRY_PLATFORM_FILE_URL || null;

  const [activeTab, setActiveTab] = useState("registered");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<MemberCard[]>(initialMembers);
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts);
  const [memberStatuses] = useState(initialStatuses);
  const [isLoading, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transition dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberCard | null>(null);

  const groups = buildGroups(counts);
  const activeGroup = groups.find((g) => g.key === activeTab);
  const activeStatusIds = activeGroup?.statusIds ?? [1];

  const loadMembers = useCallback(
    (statusIds: (number | null)[], pageNum: number, searchTerm: string) => {
      startTransition(async () => {
        const [membersResult, countsResult] = await Promise.all([
          fetchMembers(statusIds, pageNum, searchTerm || undefined),
          fetchStatusCounts(searchTerm || undefined),
        ]);
        setMembers(membersResult.members);
        setCounts(countsResult);
      });
    },
    [],
  );

  // Tab change — reset page, keep search
  function handleTabChange(tabKey: string) {
    setActiveTab(tabKey);
    setPage(1);
    const group = MEMBER_STATUS_GROUPS.find((g) => g.key === tabKey);
    if (group) {
      loadMembers(group.statusIds, 1, search);
    }
  }

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      loadMembers(activeStatusIds, 1, search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Pagination
  function handlePrev() {
    if (page <= 1) return;
    const newPage = page - 1;
    setPage(newPage);
    loadMembers(activeStatusIds, newPage, search);
  }

  function handleNext() {
    if (members.length < MEMBERS_PAGE_SIZE) return;
    const newPage = page + 1;
    setPage(newPage);
    loadMembers(activeStatusIds, newPage, search);
  }

  // Transition
  function handleTransition(member: MemberCard) {
    setSelectedMember(member);
    setDialogOpen(true);
  }

  function handleTransitionSuccess() {
    // Refresh current view
    loadMembers(activeStatusIds, page, search);
  }

  const totalForTab = activeGroup?.count ?? 0;
  const hasNextPage = members.length >= MEMBERS_PAGE_SIZE;

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-base sm:text-sm"
        />
        {search && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearch("")}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <MemberTabs groups={groups} activeTab={activeTab} />

        {groups.map((group) => (
          <TabsContent key={group.key} value={group.key}>
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-lg" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {search
                  ? "No members match your search."
                  : "No members in this category."}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {members.map((member) => (
                  <MemberCardComponent
                    key={member.contactId}
                    member={member}
                    mpFileUrl={mpFileUrl}
                    onTransition={handleTransition}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Pagination */}
      {!isLoading && members.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {page} &middot; {totalForTab} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={!hasNextPage}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Transition dialog */}
      <TransitionDialog
        member={selectedMember}
        memberStatuses={memberStatuses}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleTransitionSuccess}
      />
    </div>
  );
}
