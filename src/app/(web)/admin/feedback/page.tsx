import { Suspense } from "react";
import { FeedbackSettings } from "@/components/admin/feedback";

export default function FeedbackSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6 lg:p-8">
          <div className="text-muted-foreground">
            Loading feedback settings...
          </div>
        </div>
      }
    >
      <FeedbackSettings />
    </Suspense>
  );
}
