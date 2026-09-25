import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Prerendering opt-out guards.
 *
 * A prerendered page receives no CSP nonce — Next reads the nonce off the
 * incoming request — so under an enforced nonce policy its bootstrap script
 * is blocked and it never hydrates. /signin does nothing but run client-side
 * effects to start the Ministry Platform OAuth flow, so a static /signin is a
 * permanent spinner that never reaches MP, on the one page nobody can route
 * around.
 *
 * These assert on the SOURCE rather than behaviour, because the failure mode
 * is silent: the wrong shape still builds and still renders, and only the
 * build output (`○` vs `ƒ`) reveals it. Both halves are pinned because either
 * one alone silently reverts the fix.
 */
const ROUTES: [string, string][] = [
  ["signin", "src/app/signin/page.tsx"],
  ["session-error", "src/app/session-error/page.tsx"],
];

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("prerendering opt-out", () => {
  it.each(ROUTES)("%s is NOT a client module", (_n, file) => {
    // Route segment config and `connection()` are both ignored in a
    // "use client" module. The page body lives in a separate component so
    // this file can stay a server component.
    expect(read(file)).not.toMatch(/^\s*["']use client["']/m);
  });

  it.each(ROUTES)("%s defers to request time with connection()", (_n, file) => {
    const src = read(file);
    expect(src).toMatch(/from "next\/server"/);
    expect(src).toMatch(/await connection\(\)/);
  });

  it.each(ROUTES)("%s does NOT use export const dynamic", (_n, file) => {
    // Next 16 rejects it outright when cacheComponents is enabled, which is
    // upstream MPNext's documented fix and is wrong for this config.
    // anchored to a line start so the explanatory comment above it, which
    // names the rejected form, is not itself a match.
    expect(read(file)).not.toMatch(/^\s*export const dynamic\b/m);
  });

  it.each(ROUTES)("%s opts out of the prerendered shell with instant=false", (_n, file) => {
    // Under cacheComponents a route otherwise serves a prerendered shell, and
    // `connection()` alone fails the build with "uncached or runtime data
    // during prerendering".
    expect(read(file)).toMatch(/export const instant = false/);
  });

  it("the sign-in body is a client component, and still the only OAuth entry point", () => {
    const src = read("src/components/sign-in/sign-in.tsx");
    expect(src).toMatch(/^\s*["']use client["']/m);
    expect(src).toMatch(/signIn\s*\.social\(\{\s*provider:\s*MP_PROVIDER_ID/);
    expect(src).not.toMatch(/signIn\.oauth2|providerId:/);
  });
});
