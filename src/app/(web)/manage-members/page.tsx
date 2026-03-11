import { Suspense } from 'react';
import { connection } from 'next/server';
import { ManageMembersShell } from '@/components/manage-members';
import { fetchMembers, fetchStatusCounts, fetchMemberStatuses } from '@/components/manage-members/actions';

export default function ManageMembersPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl sm:text-4xl font-bold mb-6">Manage Members</h1>
      <Suspense fallback={
        <div className="text-muted-foreground">Loading members...</div>
      }>
        <ManageMembersContent />
      </Suspense>
    </div>
  );
}

async function ManageMembersContent() {
  await connection();

  const [membersResult, countsResult, statusesResult] = await Promise.all([
    fetchMembers([1], 1),          // Default: Registered tab, page 1
    fetchStatusCounts(),            // All tab counts
    fetchMemberStatuses(),          // Status lookup for dialog
  ]);

  return (
    <ManageMembersShell
      initialMembers={membersResult.members}
      initialCounts={countsResult}
      initialStatuses={statusesResult}
    />
  );
}
