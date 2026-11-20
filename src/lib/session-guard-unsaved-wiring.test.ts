import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// Batch 6: SessionGuard keeps a page whose session ended only while
// `hasUnsavedChanges()` is true. A form whose unsaved state is not in a
// mounted text field declares it with useUnsavedChanges(<dirty>). Each
// declaration must END with the edit (cleared on save, on cancel, on close),
// or one edit holds member data on screen forever. This pins every call, its
// exact condition, and that it runs before the component's early return (a
// hook after it would not run while the component renders nothing). The
// behaviour itself is pinned by render tests: quick-actions-panel.test.tsx,
// journey-detail-modal.test.tsx, compliance-detail-modal.test.tsx,
// journey-tool-editor.test.tsx and compliance-tool-editor.test.tsx. A NEW
// call must be listed here (the "no other file" test fails until it is
// reviewed).
const EXPECTED: Record<string, { call: string; before: string }> = {
  "src/components/processing/quick-actions-panel.tsx": {
    call: 'useUnsavedChanges(expanded && availableItems.length > 0 && notes.trim() !== "");',
    before: "if (!expanded || availableItems.length === 0) {",
  },
  "src/components/journey-processing/journey-detail-modal.tsx": {
    call: 'useUnsavedChanges(open && showPauseConfirm && pauseNotes.trim() !== "");',
    before: "if (!participant) return null;",
  },
  "src/components/compliance-processing/compliance-detail-modal.tsx": {
    call: 'useUnsavedChanges(open && showPauseConfirm && pauseNotes.trim() !== "");',
    before: "if (!participant) return null;",
  },
  // The tool editors compare their form against the baseline taken when the
  // reference-data load ends; the early return is the loading line.
  "src/components/admin/journey-tools/journey-tool-editor.tsx": {
    call: "useUnsavedChanges(loadedEditState !== null && editState(milestones) !== loadedEditState);",
    before: "if (loadingRef) {",
  },
  "src/components/admin/compliance-tools/compliance-tool-editor.tsx": {
    call: "useUnsavedChanges(loadedEditState !== null && editState() !== loadedEditState);",
    before: "if (loadingRef) {",
  },
};

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf-8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const calls = (src: string) => src.split("useUnsavedChanges(").length - 1;

/** The body of `const <name> = async () => { ... };`, up to the next handler. */
function handler(src: string, name: string, next: string): string {
  const start = src.indexOf(`const ${name} = async () => {`);
  const end = src.indexOf(`const ${next} = `, start);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  expect(end, `${next} not found after ${name}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("useUnsavedChanges declarations", () => {
  it.each(Object.entries(EXPECTED))("%s declares exactly its condition, before the early return", (file, { call, before }) => {
    const src = read(file);
    expect(calls(src)).toBe(1);
    expect(src).toContain(call);
    expect(src).toContain(before);
    expect(src.indexOf(call)).toBeLessThan(src.indexOf(before));
  });

  it("no other source file declares unsaved changes (a new one must be listed above)", () => {
    const declaring = sourceFiles(join(root, "src"))
      .map((f) => relative(root, f))
      .filter((f) => f !== "src/lib/unsaved-changes.ts")
      .filter((f) => calls(read(f)) > 0)
      .sort();
    expect(declaring).toEqual(Object.keys(EXPECTED).sort());
  });
});

describe("the claims end with the edit", () => {
  // QuickActionsPanel's claim ends when `notes` is cleared. Both callers must
  // clear it after a successful submit, or a saved note would hold the page.
  it.each([
    ["src/components/journey-processing/journey-detail-modal.tsx", "handleMarkMilestoneComplete", "handlePhotoUpload"],
    ["src/components/compliance-processing/compliance-detail-modal.tsx", "handleQuickActionSubmit", "handlePhotoUpload"],
  ])("%s clears the quick-action notes after a successful submit", (file, name, next) => {
    const body = handler(read(file), name, next);
    const tryBlock = body.slice(0, body.indexOf("} catch"));
    expect(tryBlock).toContain('setMilestoneNotes("");');
    expect(tryBlock.indexOf('setMilestoneNotes("");')).toBeLessThan(tryBlock.indexOf("onUpdate();"));
  });

  // A failed pause keeps the reason step open (it is the only copy of the
  // text); only a successful one closes it. Pinned in both twins: each relies
  // on the mounted textarea and on its declaration, which `showPauseConfirm`
  // ends.
  it.each([
    "src/components/journey-processing/journey-detail-modal.tsx",
    "src/components/compliance-processing/compliance-detail-modal.tsx",
  ])("%s closes the pause step only after a successful pause", (file) => {
    const body = handler(read(file), "handlePause", "handleResume");
    const success = body.slice(body.indexOf("if (!result.success)"), body.indexOf("} catch"));
    const rest = body.slice(body.indexOf("} catch"));
    expect(success).toContain("setShowPauseConfirm(false);");
    expect(success.indexOf("setShowPauseConfirm(false);")).toBeGreaterThan(success.indexOf("return;"));
    expect(rest).not.toContain("setShowPauseConfirm");
  });
});
