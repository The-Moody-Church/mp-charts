import { Suspense } from 'react';
import { connection } from 'next/server';
import { JourneyToolsAdmin } from '@/components/admin/journey-tools';
import { getJourneyToolsConfigAction, resolveToolNames, type ResolvedNames } from '@/components/admin/journey-tools/actions';
import type { JourneyToolsConfig } from '@/lib/journey-tools-config-types';

export default function JourneyToolsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading journey tools...</div>
      </div>
    }>
      <JourneyToolsContent />
    </Suspense>
  );
}

// Mirrors the compliance-tools page. The config read used to happen in a client
// useEffect whose body called setLoading()/setConfig() synchronously
// (react-hooks/set-state-in-effect). `resolveToolNames` has to move server-side
// in the same change — leaving it on the client would just relocate the
// violation into a second effect.
async function JourneyToolsContent() {
  // Defer to request time — requireFeatureAccess() reads headers, which are not
  // available during the build-time prerender pass.
  await connection();

  // Only the fetches are guarded; the JSX return stays outside the try so a
  // render error reaches the error boundary rather than being swallowed
  // (react-hooks/error-boundaries).
  let initialConfig: JourneyToolsConfig;
  // The empty-maps default is load-bearing: the card body falls back to
  // "Unknown" for any id missing from these maps.
  let initialNames: ResolvedNames = { programs: {}, groups: {} };
  let initialError: string | null = null;

  try {
    initialConfig = await getJourneyToolsConfigAction();

    const programIds = initialConfig.journeys.map((j) => j.programId).filter(Boolean) as number[];
    const groupIds = initialConfig.journeys.flatMap((j) =>
      [j.trackingGroupId, j.pausedGroupId].filter(Boolean) as number[]
    );
    if (programIds.length > 0 || groupIds.length > 0) {
      initialNames = await resolveToolNames(programIds, groupIds);
    }
  } catch {
    initialConfig = { journeys: [] };
    initialError = "Failed to load journey tools configuration.";
  }

  return (
    <JourneyToolsAdmin
      initialConfig={initialConfig}
      initialNames={initialNames}
      initialError={initialError}
    />
  );
}
