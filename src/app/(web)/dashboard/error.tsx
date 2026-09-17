'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16 passes `retry`, which re-fetches and re-renders the segment.
  // `reset` still exists but only clears error state without re-fetching, so a
  // boundary wired to it renders fine and its button silently does less.
  retry: () => void;
}) {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Alert variant="destructive">
        <AlertTitle>Error Loading Dashboard</AlertTitle>
        <AlertDescription>
          {error.message || 'Failed to load dashboard metrics. Please try again.'}
        </AlertDescription>
      </Alert>
      <Button onClick={retry} className="mt-4">
        Try Again
      </Button>
    </div>
  );
}
