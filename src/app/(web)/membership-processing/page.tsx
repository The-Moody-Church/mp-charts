import { redirect } from 'next/navigation';

interface MembershipProcessingPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MembershipProcessingPage({ searchParams }: MembershipProcessingPageProps) {
  const params = await searchParams;
  const applicant = typeof params.applicant === 'string' ? params.applicant : null;
  redirect(`/journey/membership${applicant ? `?applicant=${applicant}` : ''}`);
}
