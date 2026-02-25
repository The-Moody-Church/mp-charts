import { Suspense } from "react";
import { TemplateTool } from "./template-tool";
import { parseToolParams } from "@/lib/tool-params";

interface TemplatePageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function TemplateToolPage({ searchParams }: TemplatePageProps) {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-muted-foreground">Loading tool...</div>
      </div>
    }>
      <TemplateToolContent searchParams={searchParams} />
    </Suspense>
  );
}

async function TemplateToolContent({ searchParams }: TemplatePageProps) {
  const params = await parseToolParams(await searchParams);

  return <TemplateTool params={params} />;
}
