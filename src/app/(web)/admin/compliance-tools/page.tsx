import { Suspense } from 'react';
import { ComplianceToolsAdmin } from '@/components/admin/compliance-tools';

export default function ComplianceToolsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading compliance tools...</div>
      </div>
    }>
      <ComplianceToolsAdmin />
    </Suspense>
  );
}
