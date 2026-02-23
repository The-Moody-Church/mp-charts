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
      <div className="container mx-auto p-4 space-y-6">
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
    <div className="container mx-auto p-4 space-y-6">
      <ContactLookupDetails guid={guid} />
    </div>
  );
}
