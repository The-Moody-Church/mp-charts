import { Suspense } from 'react';
import { PermissionsAdmin } from '@/components/admin/permissions';

export default function PermissionsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading permissions...</div>
      </div>
    }>
      <PermissionsAdmin />
    </Suspense>
  );
}
