import { Suspense } from 'react';
import { JourneyToolsAdmin } from '@/components/admin/journey-tools';

export default function JourneyToolsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading journey tools...</div>
      </div>
    }>
      <JourneyToolsAdmin />
    </Suspense>
  );
}
