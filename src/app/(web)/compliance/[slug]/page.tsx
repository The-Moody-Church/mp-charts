import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getComplianceToolBySlug } from '@/lib/compliance-tools-config';
import { ComplianceProcessing } from '@/components/compliance-processing';

interface CompliancePageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function CompliancePage({ params, searchParams }: CompliancePageProps) {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    }>
      <CompliancePageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CompliancePageContent({ params, searchParams }: CompliancePageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const config = getComplianceToolBySlug(slug);
  if (!config || !config.enabled) {
    notFound();
  }

  const applicantParam = typeof sp.applicant === 'string' ? Number(sp.applicant) : null;
  const initialApplicantId = applicantParam && !isNaN(applicantParam) ? applicantParam : null;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <ComplianceProcessing slug={slug} config={config} initialApplicantId={initialApplicantId} />
    </div>
  );
}
