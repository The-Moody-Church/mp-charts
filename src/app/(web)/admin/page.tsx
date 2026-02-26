import { Suspense } from "react";
import { connection } from "next/server";
import { AdminPage } from "@/components/admin";
import { getFeatureAccessConfig, getAvailableUserGroups } from "@/components/admin/actions";

export default function AdminRoute() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
          <div className="text-muted-foreground">Loading admin...</div>
        </div>
      }
    >
      <AdminContent />
    </Suspense>
  );
}

async function AdminContent() {
  await connection();

  const [config, userGroups] = await Promise.all([
    getFeatureAccessConfig(),
    getAvailableUserGroups(),
  ]);

  return <AdminPage initialConfig={config} userGroups={userGroups} />;
}
