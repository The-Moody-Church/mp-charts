"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface DynamicBreadcrumbProps {
  customSegments?: BreadcrumbSegment[];
}

export function DynamicBreadcrumb({ customSegments }: DynamicBreadcrumbProps) {
  const pathname = usePathname();

  // Generate breadcrumbs from pathname if no custom segments provided
  const segments = customSegments || generateSegmentsFromPath(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Home</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {segments.map((segment, index) => (
          <div key={index} className="flex items-center">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {segment.href && index < segments.length - 1 ? (
                <BreadcrumbLink asChild>
                  <Link href={segment.href}>{segment.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{segment.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </div>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

// Path prefixes that are namespace-only (no standalone page exists)
const NON_LINKABLE_PREFIXES = new Set(["journey", "compliance"]);

function generateSegmentsFromPath(pathname: string): BreadcrumbSegment[] {
  const pathSegments = pathname.split("/").filter(Boolean);

  return pathSegments.map((segment, index) => {
    const href = "/" + pathSegments.slice(0, index + 1).join("/");
    const label = segment
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    const isIntermediate = index < pathSegments.length - 1;
    const isLinkable = isIntermediate && !NON_LINKABLE_PREFIXES.has(segment);

    return {
      label,
      href: isLinkable ? href : undefined,
    };
  });
}
