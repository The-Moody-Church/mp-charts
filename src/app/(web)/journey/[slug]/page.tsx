import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getJourneyToolBySlug } from '@/lib/journey-tools-config';
import { JourneyProcessing } from '@/components/journey-processing';

interface JourneyPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function JourneyPage({ params, searchParams }: JourneyPageProps) {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <JourneyPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function JourneyPageContent({ params, searchParams }: JourneyPageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const config = getJourneyToolBySlug(slug);
  if (!config || !config.enabled) {
    notFound();
  }

  const applicantParam = typeof sp.applicant === 'string' ? Number(sp.applicant) : null;
  const initialApplicantId = applicantParam && !isNaN(applicantParam) ? applicantParam : null;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      {/* key={slug} is redundant — the dynamic segment's value is part of Next's
          router cache key, so /journey/a -> /journey/b already remounts — but the
          deep-link latch and the per-open modal counter both assume a fresh mount
          per tool, so state the invariant rather than inheriting it. */}
      <JourneyProcessing key={slug} slug={slug} config={config} initialApplicantId={initialApplicantId} />
    </div>
  );
}
