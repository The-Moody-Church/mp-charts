import { Suspense } from 'react';
import { BaptismProcessing } from '@/components/baptism-processing';

interface BaptismProcessingPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function BaptismProcessingPage({ searchParams }: BaptismProcessingPageProps) {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-8">
        <div className="text-muted-foreground">Loading baptism applicants...</div>
      </div>
    }>
      <BaptismProcessingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BaptismProcessingContent({ searchParams }: BaptismProcessingPageProps) {
  const params = await searchParams;
  const applicantParam = typeof params.applicant === 'string' ? Number(params.applicant) : null;
  const initialApplicantId = applicantParam && !isNaN(applicantParam) ? applicantParam : null;

  return (
    <div className="container mx-auto p-8">
      <BaptismProcessing initialApplicantId={initialApplicantId} />
    </div>
  );
}
