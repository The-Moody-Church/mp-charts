import { redirect } from 'next/navigation';

interface BaptismProcessingPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function BaptismProcessingPage({ searchParams }: BaptismProcessingPageProps) {
  const params = await searchParams;
  const applicant = typeof params.applicant === 'string' ? params.applicant : null;
  redirect(`/journey/baptism${applicant ? `?applicant=${applicant}` : ''}`);
}
