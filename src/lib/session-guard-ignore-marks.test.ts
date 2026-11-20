import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { SESSION_GUARD_IGNORE_ATTRIBUTE } from "./unsaved-changes";

// Batch 6: a live SEARCH box must never hold member data on screen after the
// session ends, so each one carries data-session-guard-ignore. Pins the exact
// count per file: removing a mark, or adding a search input without one where
// a mark already exists, fails here. A NEW file with a search box must be
// added to this list (the "no other file" test fails until it is reviewed).
const EXPECTED: Record<string, number> = {
  "src/components/contact-lookup/contact-lookup-search.tsx": 1,
  "src/components/processing/processing-search-bar.tsx": 1,
  "src/components/admin/permissions/permissions-admin.tsx": 1,
  "src/components/manage-members/manage-members-shell.tsx": 1,
  // program, group and paused-group pickers
  "src/components/admin/journey-tools/journey-tool-editor.tsx": 3,
  "src/components/admin/compliance-tools/compliance-tool-editor.tsx": 3,
};

const root = process.cwd();

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const count = (src: string) => src.split(SESSION_GUARD_IGNORE_ATTRIBUTE).length - 1;

describe("live search inputs are marked data-session-guard-ignore", () => {
  it.each(Object.entries(EXPECTED))("%s has %i", (file, expected) => {
    const src = readFileSync(join(root, file), "utf-8");
    expect(count(src)).toBe(expected);
  });

  it("no other source file uses the mark (a new one must be listed above)", () => {
    const marked = sourceFiles(join(root, "src"))
      .map((f) => relative(root, f))
      .filter((f) => f !== "src/lib/unsaved-changes.ts")
      .filter((f) => count(readFileSync(join(root, f), "utf-8")) > 0)
      .sort();
    expect(marked).toEqual(Object.keys(EXPECTED).sort());
  });
});
