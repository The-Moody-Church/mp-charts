import { Suspense } from 'react';
import { MembershipProcessing } from '@/components/membership-processing';

interface MembershipProcessingPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function MembershipProcessingPage({ searchParams }: MembershipProcessingPageProps) {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-8">
        <div className="text-muted-foreground">Loading membership applicants...</div>
      </div>
    }>
      <MembershipProcessingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MembershipProcessingContent({ searchParams }: MembershipProcessingPageProps) {
  const params = await searchParams;
  const applicantParam = typeof params.applicant === 'string' ? Number(params.applicant) : null;
  const initialApplicantId = applicantParam && !isNaN(applicantParam) ? applicantParam : null;

  return (
    <div className="container mx-auto p-8">
      <MembershipProcessing initialApplicantId={initialApplicantId} />
    </div>
  );
}
