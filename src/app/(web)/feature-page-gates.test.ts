import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// N10: pages that serialise feature config to the browser must gate on the
// feature BEFORE reading that config. Page components have no unit tests
// (testing.md), so this pins the call order in the source instead.
const dir = join(process.cwd(), "src/app/(web)");

const pages = [
  { file: "journey/[slug]/page.tsx", gate: "requireFeaturePageAccess(`journey:${slug}`)", read: "getJourneyToolBySlug(" },
  { file: "compliance/[slug]/page.tsx", gate: "requireFeaturePageAccess(`compliance:${slug}`)", read: "getComplianceToolBySlug(" },
  { file: "summer-blast-volunteers/page.tsx", gate: 'requireFeaturePageAccess("summer-blast-volunteers")', read: "getSummerBlastConfig(" },
  { file: "admin/layout.tsx", gate: 'requireFeaturePageAccess("admin")', read: "{children}" },
];

describe("feature pages gate before reading config (N10)", () => {
  it.each(pages)("$file", ({ file, gate, read }) => {
    const src = readFileSync(join(dir, file), "utf-8");
    const gateAt = src.indexOf(`await ${gate}`);
    const readAt = src.indexOf(read);
    expect(gateAt, "awaited gate call").toBeGreaterThan(-1);
    expect(readAt, "config read").toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(readAt);
  });

  it("journey and compliance still 404 an unknown slug after the gate", () => {
    for (const file of ["journey/[slug]/page.tsx", "compliance/[slug]/page.tsx"]) {
      const src = readFileSync(join(dir, file), "utf-8");
      expect(src.indexOf("notFound();"), file).toBeGreaterThan(src.indexOf("await requireFeaturePageAccess("));
    }
  });
});
