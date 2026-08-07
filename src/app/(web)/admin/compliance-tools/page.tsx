import { Suspense } from 'react';
import { connection } from 'next/server';
import { ComplianceToolsAdmin } from '@/components/admin/compliance-tools';
import { getComplianceToolsConfigAction } from '@/components/admin/compliance-tools/actions';
import type { ComplianceToolsConfig } from '@/lib/compliance-tools-config-types';

export default function ComplianceToolsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading compliance tools...</div>
      </div>
    }>
      <ComplianceToolsContent />
    </Suspense>
  );
}

// The config read used to happen in a client-side useEffect, whose body called
// setLoading()/setConfig() synchronously (react-hooks/set-state-in-effect).
// Reading it here instead removes the effect entirely and drops one round trip:
// the Suspense fallback above already renders markup identical to the client
// `if (loading)` block it replaces.
async function ComplianceToolsContent() {
  // Defer to request time — requireFeatureAccess() reads headers, which are not
  // available during the build-time prerender pass.
  await connection();

  // Only the fetch is guarded — the JSX return stays outside the try, so a
  // render error propagates to the error boundary instead of being swallowed
  // (react-hooks/error-boundaries). On failure we seed the component's existing
  // `error` state rather than throwing, so a load failure still renders the
  // in-page Alert, which is what it looked like before this change.
  let initialConfig: ComplianceToolsConfig;
  let initialError: string | null = null;
  try {
    initialConfig = await getComplianceToolsConfigAction();
  } catch {
    initialConfig = { tools: [] };
    initialError = "Failed to load compliance tools configuration.";
  }

  return <ComplianceToolsAdmin initialConfig={initialConfig} initialError={initialError} />;
}
