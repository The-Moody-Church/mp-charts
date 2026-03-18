import { Suspense } from "react";
import { ContactLookupDetails } from "@/components/contact-lookup-details";

interface ContactLookupDetailPageProps {
  params: Promise<{
    guid: string;
  }>;
}

export default function ContactLookupDetailPage({
  params,
}: ContactLookupDetailPageProps) {
  return (
    <Suspense fallback={
      <div className="container mx-auto max-w-4xl lg:max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="text-muted-foreground">Loading contact...</div>
      </div>
    }>
      <ContactLookupDetailContent params={params} />
    </Suspense>
  );
}

async function ContactLookupDetailContent({
  params,
}: ContactLookupDetailPageProps) {
  const { guid } = await params;

  return (
    <div className="container mx-auto max-w-4xl lg:max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
      <ContactLookupDetails guid={guid} />
    </div>
  );
}
