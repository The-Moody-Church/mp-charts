import { Suspense } from 'react';
import { connection } from 'next/server';
import { ManageMembersShell } from '@/components/manage-members';
import { fetchMembersAndCounts, fetchMemberStatuses } from '@/components/manage-members/actions';

interface Props {
  searchParams: Promise<{ member?: string }>;
}

export default function ManageMembersPage({ searchParams }: Props) {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl sm:text-4xl font-bold mb-6">Manage Members</h1>
      <Suspense fallback={
        <div className="text-muted-foreground">Loading members...</div>
      }>
        <ManageMembersContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ManageMembersContent({ searchParams }: Props) {
  await connection();
  const params = await searchParams;
  const memberId = params.member ? Number(params.member) : null;

  const [{ members, counts }, statusesResult] = await Promise.all([
    fetchMembersAndCounts([1], 1),  // Default: Registered tab, page 1
    fetchMemberStatuses(),           // Status lookup for dialog
  ]);

  return (
    <ManageMembersShell
      initialMembers={members}
      initialCounts={counts}
      initialStatuses={statusesResult}
      initialMemberId={memberId}
    />
  );
}
