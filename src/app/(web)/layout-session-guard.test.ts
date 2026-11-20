import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Batch 6: SessionGuard must wrap the whole (web) shell, inside Providers (it
// reads no context today, but the warning renders above the page) and around
// the Header and every page. Layouts have no unit tests (testing.md), so this
// pins the nesting in the source, as feature-page-gates.test.ts does for N10.
const src = readFileSync(join(process.cwd(), "src/app/(web)/layout.tsx"), "utf-8");

describe("(web) layout wraps the shell in SessionGuard", () => {
  it("imports SessionGuard from the layout barrel", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bSessionGuard\b[^}]*\}\s*from\s*"@\/components\/layout"/);
  });

  it("opens <SessionGuard> after <Providers and before <Header, and closes it after {children}", () => {
    const providersOpen = src.indexOf("<Providers");
    const guardOpen = src.indexOf("<SessionGuard>");
    const header = src.indexOf("<Header");
    const children = src.indexOf("{children}");
    const guardClose = src.indexOf("</SessionGuard>");
    const providersClose = src.indexOf("</Providers>");

    for (const [name, at] of Object.entries({ providersOpen, guardOpen, header, children, guardClose, providersClose })) {
      expect(at, name).toBeGreaterThan(-1);
    }
    expect(providersOpen).toBeLessThan(guardOpen);
    expect(guardOpen).toBeLessThan(header);
    expect(header).toBeLessThan(children);
    expect(children).toBeLessThan(guardClose);
    expect(guardClose).toBeLessThan(providersClose);
  });

  it("has exactly one SessionGuard and one {children}", () => {
    expect(src.split("<SessionGuard>").length - 1).toBe(1);
    expect(src.split("</SessionGuard>").length - 1).toBe(1);
    expect(src.split("{children}").length - 1).toBe(1);
  });
});
