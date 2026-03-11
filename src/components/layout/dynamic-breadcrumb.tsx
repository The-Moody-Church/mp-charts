"use client";

import { createContext, useContext, useState, useCallback } from "react";
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

// Context for child components to override breadcrumb segments
interface BreadcrumbOverrideContextType {
  overrideSegments: BreadcrumbSegment[] | null;
  setOverrideSegments: (segments: BreadcrumbSegment[] | null) => void;
}

const BreadcrumbOverrideContext = createContext<BreadcrumbOverrideContextType>({
  overrideSegments: null,
  setOverrideSegments: () => {},
});

export function BreadcrumbOverrideProvider({ children }: { children: React.ReactNode }) {
  const [overrideSegments, setOverrideSegments] = useState<BreadcrumbSegment[] | null>(null);
  return (
    <BreadcrumbOverrideContext.Provider value={{ overrideSegments, setOverrideSegments }}>
      {children}
    </BreadcrumbOverrideContext.Provider>
  );
}

export function useBreadcrumbOverride() {
  const { setOverrideSegments } = useContext(BreadcrumbOverrideContext);
  return useCallback((segments: BreadcrumbSegment[] | null) => {
    setOverrideSegments(segments);
  }, [setOverrideSegments]);
}

interface DynamicBreadcrumbProps {
  customSegments?: BreadcrumbSegment[];
}

export function DynamicBreadcrumb({ customSegments }: DynamicBreadcrumbProps) {
  const pathname = usePathname();
  const { overrideSegments } = useContext(BreadcrumbOverrideContext);

  // Priority: prop customSegments > context override > auto-generated
  const segments = customSegments || overrideSegments || generateSegmentsFromPath(pathname);

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

// Custom labels for URL segments that don't split nicely on hyphens
const SEGMENT_LABELS: Record<string, string> = {
  "contact-lookup": "Contact Lookup",
};

// GUID pattern: 8-4-4-4-12 hex chars (with or without hyphens, MP sometimes uses spaces)
const GUID_PATTERN = /^[0-9a-f]{8}[-\s]?[0-9a-f]{4}[-\s]?[0-9a-f]{4}[-\s]?[0-9a-f]{4}[-\s]?[0-9a-f]{12}$/i;

function generateSegmentsFromPath(pathname: string): BreadcrumbSegment[] {
  const pathSegments = pathname.split("/").filter(Boolean);

  return pathSegments
    .filter((segment) => !GUID_PATTERN.test(segment))
    .map((segment, index, filtered) => {
      const hrefIndex = pathSegments.indexOf(segment);
      const href = "/" + pathSegments.slice(0, hrefIndex + 1).join("/");
      const label =
        SEGMENT_LABELS[segment] ||
        segment
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      const isIntermediate = index < filtered.length - 1;
      const isLinkable = isIntermediate && !NON_LINKABLE_PREFIXES.has(segment);

      return {
        label,
        href: isLinkable ? href : undefined,
      };
    });
}
