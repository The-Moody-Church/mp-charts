'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container mx-auto p-8">
      <Alert variant="destructive">
        <AlertTitle>Error Loading Dashboard</AlertTitle>
        <AlertDescription>
          {error.message || 'Failed to load dashboard metrics. Please try again.'}
        </AlertDescription>
      </Alert>
      <Button onClick={reset} className="mt-4">
        Try Again
      </Button>
    </div>
  );
}
