import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QuickActionsPanel } from "@/components/processing/quick-actions-panel";
import { hasUnsavedChanges } from "@/lib/unsaved-changes";

function panelProps(
  overrides: Partial<React.ComponentProps<typeof QuickActionsPanel>> = {},
): React.ComponentProps<typeof QuickActionsPanel> {
  const props: React.ComponentProps<typeof QuickActionsPanel> = {
    availableItems: [{ key: "app", label: "Application" }],
    selectedKey: "app",
    onSelectedKeyChange: vi.fn(),
    date: "2026-11-10",
    onDateChange: vi.fn(),
    notes: "",
    onNotesChange: vi.fn(),
    fileInputRef: React.createRef<HTMLInputElement>(),
    fileError: null,
    onFileError: vi.fn(),
    canSubmit: true,
    submitting: false,
    onSubmit: vi.fn(),
    expanded: true,
    onExpandedChange: vi.fn(),
    ...overrides,
  };
  return props;
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof QuickActionsPanel>> = {}) {
  const props = panelProps(overrides);
  render(<QuickActionsPanel {...props} />);
  return props;
}

describe("QuickActionsPanel submit error", () => {
  it("shows the failure beside Mark Complete instead of resetting silently", () => {
    renderPanel({ submitError: "The request didn't reach the server, so nothing was saved." });
    expect(screen.getByRole("alert")).toHaveTextContent("didn't reach the server");
    // Unlike a file error, a submit error leaves the button usable for a retry.
    expect(screen.getByRole("button", { name: "Mark Complete" })).toBeEnabled();
  });

  it("shows nothing when there is no error", () => {
    renderPanel();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the error when the panel is closed", () => {
    const onSubmitErrorChange = vi.fn();
    const onExpandedChange = vi.fn();
    renderPanel({ submitError: "x", onSubmitErrorChange, onExpandedChange });
    const close = screen.getAllByRole("button").find((b) => b.textContent === "");
    fireEvent.click(close!);
    expect(onSubmitErrorChange).toHaveBeenCalledWith(null);
    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });
});

// SessionGuard (batch 6) asks hasUnsavedChanges() when a session ends. The
// notes textarea is mounted only while an item is selected (and, in
// compliance, only for an item type that takes notes), so typed notes can sit
// unsaved in the parent's state with no textarea on screen. The panel declares
// them with useUnsavedChanges while it is open.
describe("QuickActionsPanel unsaved notes (SessionGuard)", () => {
  it("declares typed notes when choosing \"Select...\" unmounts the textarea", () => {
    const { container } = render(
      <QuickActionsPanel {...panelProps({ selectedKey: "", notes: "Called on Tuesday" })} />,
    );
    expect(container.querySelector("textarea")).toBeNull();
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("declares typed notes when the selected item takes no notes (showNotes false)", () => {
    const { container } = render(
      <QuickActionsPanel {...panelProps({ showNotes: false, notes: "Called on Tuesday" })} />,
    );
    expect(container.querySelector("textarea")).toBeNull();
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("stops declaring once the notes are cleared (a successful submit or Close)", () => {
    const { rerender } = render(<QuickActionsPanel {...panelProps({ notes: "note" })} />);
    expect(hasUnsavedChanges()).toBe(true);
    rerender(<QuickActionsPanel {...panelProps({ selectedKey: "", notes: "" })} />);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("never declares blank notes, a closed panel, or a panel with nothing left to complete", () => {
    const { rerender, unmount } = render(<QuickActionsPanel {...panelProps({ notes: "  \n " })} />);
    expect(hasUnsavedChanges()).toBe(false);
    rerender(<QuickActionsPanel {...panelProps({ notes: "note", expanded: false })} />);
    expect(hasUnsavedChanges()).toBe(false);
    rerender(<QuickActionsPanel {...panelProps({ notes: "note", availableItems: [] })} />);
    expect(hasUnsavedChanges()).toBe(false);
    rerender(<QuickActionsPanel {...panelProps({ notes: "note" })} />);
    expect(hasUnsavedChanges()).toBe(true);
    unmount();
    expect(hasUnsavedChanges()).toBe(false);
  });
});
