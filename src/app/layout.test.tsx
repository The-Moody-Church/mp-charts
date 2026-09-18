import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Root-layout prerendering opt-out.
 *
 * A nonce-based Content-Security-Policy and Next's prerendered shells are
 * mutually exclusive: Next reads the nonce off the INCOMING REQUEST, so a
 * shell built at `next build` has no request and its script tags get no
 * nonce. Under an enforced policy those scripts are blocked and the page
 * never hydrates.
 *
 * These assert on the SOURCE. The build OUTPUT is gated separately by
 * `npm run check:shells`, which is the check that actually matters — these
 * can pass while the outcome is still wrong. Both exist because the source
 * test names the intent and fails fast in the unit run, while the output
 * check catches causes this file cannot see.
 */
const LAYOUT = "src/app/layout.tsx";
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("root layout prerendering opt-out", () => {
  it("is NOT a client module", () => {
    // Route segment config and `connection()` are both ignored in a
    // "use client" module, which would make the opt-out silently inert.
    expect(read(LAYOUT)).not.toMatch(/^\s*["']use client["']/m);
  });

  it("defers the whole app to request time with connection()", () => {
    const src = read(LAYOUT);
    expect(src).toMatch(/from "next\/server"/);
    expect(src).toMatch(/await connection\(\)/);
  });

  it("opts out of the prerendered shell with instant=false", () => {
    // Next documents this on the root layout as covering the entire app.
    // Without it the build fails on "uncached or runtime data during
    // prerendering"; with it, and without connection(), the shells come back.
    expect(read(LAYOUT)).toMatch(/^\s*export const instant = false/m);
  });

  it("does NOT use export const dynamic", () => {
    // Next 16 rejects it outright when cacheComponents is enabled. Anchored to
    // a line start so the comment naming the rejected form is not a match.
    expect(read(LAYOUT)).not.toMatch(/^\s*export const dynamic\b/m);
  });

  it("keeps a build-output gate wired into CI", () => {
    // The source assertions above cannot see a shell reintroduced by a nested
    // layout, a route-level opt-in, or a Next upgrade. If this ever stops
    // running, the real protection is gone and nothing else would say so.
    expect(read("package.json")).toMatch(/"check:shells"/);
    expect(read(".github/workflows/docker-build-push.yml")).toMatch(/npm run check:shells/);
  });
});
