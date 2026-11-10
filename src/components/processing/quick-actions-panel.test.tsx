import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { QuickActionsPanel } from "@/components/processing/quick-actions-panel";

function renderPanel(overrides: Partial<React.ComponentProps<typeof QuickActionsPanel>> = {}) {
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
