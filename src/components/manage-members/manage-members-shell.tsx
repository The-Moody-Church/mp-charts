"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MemberTabs } from "./member-tabs";
import { MemberCardComponent } from "./member-card";
import { MemberDetailModal } from "./member-detail-modal";
import { TransitionDialog } from "./transition-dialog";
import { fetchMembersAndCounts, fetchMemberDetail, refreshMemberCache } from "./actions";
import { MEMBER_STATUS_GROUPS, MEMBERS_PAGE_SIZE } from "@/lib/dto";
import type { MemberCard, MemberStatusGroup } from "@/lib/dto";

interface ManageMembersShellProps {
  initialMembers: MemberCard[];
  initialCounts: Record<string, number>;
  initialStatuses: { Member_Status_ID: number; Member_Status: string }[];
  initialMemberId?: number | null;
}

/** Tracks a status transition made this session (for client-side patching of stale cache). */
interface TransitionOverride {
  oldStatusId: number;
  newStatusId: number;
}

function buildGroups(
  counts: Record<string, number>,
): MemberStatusGroup[] {
  return MEMBER_STATUS_GROUPS.map((g) => {
    let count = 0;
    for (const id of g.statusIds) {
      count += counts[String(id)] || 0;
    }
    return { ...g, count };
  });
}

/**
 * Apply transition overrides to server-returned counts.
 * For each override, decrement the old status count and increment the new.
 * Then clamp to zero to avoid negative counts if the cache already partially reflected the change.
 */
function patchCounts(
  serverCounts: Record<string, number>,
  overrides: Map<number, TransitionOverride>,
): Record<string, number> {
  if (overrides.size === 0) return serverCounts;

  const patched = { ...serverCounts };
  for (const [, { oldStatusId, newStatusId }] of overrides) {
    const oldKey = String(oldStatusId);
    const newKey = String(newStatusId);
    patched[oldKey] = (patched[oldKey] || 0) - 1;
    patched[newKey] = (patched[newKey] || 0) + 1;
  }

  // Clamp negatives (cache may have already reflected some transitions)
  for (const key of Object.keys(patched)) {
    if (patched[key] < 0) patched[key] = 0;
  }
  return patched;
}

export function ManageMembersShell({
  initialMembers,
  initialCounts,
  initialStatuses,
  initialMemberId,
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

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<MemberCard | null>(null);

  // Per-open remount counter used as the detail modal's `key`. Keying on
  // contactId would NOT change when the same member is reopened — this shell never
  // clears detailMember on close, so Radix can animate out — and both the modal's
  // refetch and its milestone-expansion reset would silently stop for exactly that
  // case. The refetch is load-bearing: milestones come from a live MP query, not
  // the 6h contacts cache, so a status change made elsewhere has to show up.
  const [detailSession, setDetailSession] = useState(0);

  // Every open routes through here — card click and deep link alike — so "an open
  // is always a fresh mount" holds unconditionally.
  const openMember = useCallback((member: MemberCard) => {
    setDetailMember(member);
    setDetailSession((n) => n + 1);
    setDetailOpen(true);
  }, []);

  // Transition dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberCard | null>(null);

  // Track transitions made this session so search/tab-switch stays fast.
  // Server may return stale cache data; client patches it with these overrides.
  const overridesRef = useRef<Map<number, TransitionOverride>>(new Map());

  // Cache refresh
  const [refreshing, setRefreshing] = useState(false);

  // Deep link: auto-open modal for ?member=contactId
  //
  // The latch is a ref, not state. Nothing renders from it, and the synchronous
  // `setHasAutoOpened(true)` was the only react-hooks/set-state-in-effect
  // violation here — everything else already ran in the promise continuation. As
  // state the guard was also ineffective where it could have mattered: under
  // StrictMode's double-invoke the second run read the stale `false` from its own
  // closure and fetched again. A ref mutates immediately, so it actually holds.
  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!initialMemberId || hasAutoOpenedRef.current) return;
    hasAutoOpenedRef.current = true;

    // Fetch detail directly — works regardless of which tab the member is on
    fetchMemberDetail(initialMemberId)
      .then((result) => {
        if (result) {
          openMember(result.member);
        } else {
          console.warn("Deep link: member not found for contactId", initialMemberId);
        }
      })
      .catch((err) => {
        console.error("Deep link: failed to fetch member detail", err);
      });
  }, [initialMemberId, openMember]);

  const groups = buildGroups(counts);
  const activeGroup = groups.find((g) => g.key === activeTab);
  const activeStatusIds = activeGroup?.statusIds ?? [1];

  const loadMembers = useCallback(
    (statusIds: number[], pageNum: number, searchTerm: string) => {
      startTransition(async () => {
        try {
          const { members: serverMembers, counts: serverCounts } =
            await fetchMembersAndCounts(statusIds, pageNum, searchTerm || undefined);

          const overrides = overridesRef.current;

          if (overrides.size === 0) {
            setMembers(serverMembers);
            setCounts(serverCounts);
            return;
          }

          // Patch member list: filter out members transitioned away from this tab
          const statusSet = new Set(statusIds);
          const patched = serverMembers.filter((m) => {
            const override = overrides.get(m.contactId);
            if (override === undefined) return true;
            return statusSet.has(override.newStatusId);
          });

          setMembers(patched);
          setCounts(patchCounts(serverCounts, overrides));
        } catch {
          // Rate limit or network error — keep existing data, don't crash
        }
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

  // Transition (from detail modal or directly)
  function handleTransition(member: MemberCard) {
    setSelectedMember(member);
    setDialogOpen(true);
  }

  function handleTransitionSuccess(newStatusId: number) {
    if (!selectedMember) return;

    // Record the override so future server loads get patched
    overridesRef.current.set(selectedMember.contactId, {
      oldStatusId: selectedMember.memberStatusId,
      newStatusId,
    });

    // Optimistic update: remove from current list, adjust counts instantly
    setMembers((prev) => prev.filter((m) => m.contactId !== selectedMember.contactId));
    setCounts((prev) => {
      const updated = { ...prev };
      const oldKey = String(selectedMember.memberStatusId);
      if (updated[oldKey]) updated[oldKey] = Math.max(0, updated[oldKey] - 1);
      const newKey = String(newStatusId);
      updated[newKey] = (updated[newKey] || 0) + 1;
      return updated;
    });
  }

  async function handleRefreshCache() {
    setRefreshing(true);
    try {
      const result = await refreshMemberCache();
      if (result.success) {
        // Clear local overrides — cache now has fresh data
        overridesRef.current.clear();
        loadMembers(activeStatusIds, page, search);
      }
    } finally {
      setRefreshing(false);
    }
  }

  const totalForTab = activeGroup?.count ?? 0;
  const hasNextPage = members.length >= MEMBERS_PAGE_SIZE;

  return (
    <div className="space-y-4">
      {/* Search + Refresh */}
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshCache}
          disabled={refreshing}
          title="Refresh member data from Ministry Platform"
        >
          <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </Button>
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
                    onClick={openMember}
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

      {/* Detail modal */}
      <MemberDetailModal
        key={detailSession}
        member={detailMember}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onTransition={handleTransition}
        mpFileUrl={mpFileUrl}
        onUpdate={() => loadMembers(activeStatusIds, page, search)}
      />

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
