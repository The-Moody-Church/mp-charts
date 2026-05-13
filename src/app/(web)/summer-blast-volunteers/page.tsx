import { Suspense } from "react";
import { connection } from "next/server";
import { SummerBlastVolunteers } from "@/components/summer-blast-volunteers";
import { getSummerBlastConfig } from "@/lib/summer-blast-config";

export default function SummerBlastVolunteersPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <Suspense
        fallback={<div className="text-muted-foreground">Loading Summer Blast volunteers...</div>}
      >
        <SummerBlastVolunteersContent />
      </Suspense>
    </div>
  );
}

async function SummerBlastVolunteersContent() {
  await connection();
  const config = getSummerBlastConfig();
  return (
    <SummerBlastVolunteers
      eventName={config.eventName}
      eventEndDate={config.eventEndDate}
      roleOptions={config.roleConfigs.map((r) => ({
        groupRoleId: r.groupRoleId,
        label: r.label,
      }))}
      tempGroupRoleId={config.tempGroupRoleId}
    />
  );
}
