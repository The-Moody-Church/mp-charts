import { describe, it, expect, afterEach } from "vitest";
import { render, renderHook, fireEvent, cleanup } from "@testing-library/react";
import {
  hasUnsavedChanges,
  hasUnsavedTypedText,
  trackTypedInput,
  useUnsavedChanges,
  SESSION_GUARD_IGNORE_ATTRIBUTE,
} from "./unsaved-changes";

/**
 * The unsaved-edit detector SessionGuard asks when a session ends. Typing is
 * simulated with fireEvent.input after setting the value, which is what a
 * browser delivers: the field's value changes, then a bubbling `input` event.
 */

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  stop = undefined;
  cleanup();
});

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  fireEvent.input(el);
}

describe("typed-field tracking", () => {
  it("holds for a textarea the user typed into, while it has text", () => {
    stop = trackTypedInput();
    const { container } = render(<textarea />);
    const area = container.querySelector("textarea")!;

    expect(hasUnsavedChanges()).toBe(false);
    type(area, "Visited on Sunday");
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("stops holding once the field is cleared (saved and reset) or blank", () => {
    stop = trackTypedInput();
    const { container } = render(<textarea />);
    const area = container.querySelector("textarea")!;

    type(area, "note");
    area.value = "";
    expect(hasUnsavedTypedText()).toBe(false);
    type(area, "   \n ");
    expect(hasUnsavedTypedText()).toBe(false);
  });

  it("stops holding once the field leaves the document (dialog closed)", () => {
    stop = trackTypedInput();
    const { container, unmount } = render(<textarea />);
    type(container.querySelector("textarea")!, "note");

    unmount();

    expect(hasUnsavedChanges()).toBe(false);
  });

  it("ignores a value set by code, with no input event", () => {
    stop = trackTypedInput();
    const { container } = render(<textarea defaultValue="loaded from MP" />);

    expect(container.querySelector("textarea")!.value).toBe("loaded from MP");
    expect(hasUnsavedChanges()).toBe(false);
  });

  it.each([
    ["text", "x@y.z"],
    ["email", "x@y.z"],
    ["tel", "555-0100"],
    ["url", "https://example.org"],
    ["number", "4"],
    ["date", "2026-11-20"],
    ["datetime-local", "2026-11-20T10:30"],
    ["month", "2026-11"],
    ["week", "2026-W47"],
    ["time", "10:30"],
  ])("tracks type=%s", (inputType, value) => {
    stop = trackTypedInput();
    const { container } = render(<input type={inputType} />);
    const input = container.querySelector("input")!;

    type(input, value);

    // jsdom sanitises a value it cannot parse to "", which would make this
    // pass for the wrong reason; make sure the value really landed.
    expect(input.value).toBe(value);
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("still counts typing under a wrapper that stops the input event bubbling (capture-phase listener)", () => {
    stop = trackTypedInput();
    const { container } = render(
      <div data-testid="wrapper">
        <textarea />
      </div>
    );
    container
      .querySelector("[data-testid=wrapper]")!
      .addEventListener("input", (event) => event.stopPropagation());

    type(container.querySelector("textarea")!, "typed inside a widget that swallows input");

    expect(hasUnsavedChanges()).toBe(true);
  });

  it.each(["search", "password", "hidden", "checkbox", "radio", "range", "color"])(
    "does not track type=%s",
    (inputType) => {
      stop = trackTypedInput();
      const { container } = render(<input type={inputType} />);
      const input = container.querySelector("input")!;

      input.value = inputType === "range" ? "50" : inputType === "color" ? "#ff0000" : "secret";
      fireEvent.input(input);

      expect(hasUnsavedChanges()).toBe(false);
    }
  );

  it("does not track a field inside [data-session-guard-ignore] (a live search)", () => {
    stop = trackTypedInput();
    const { container } = render(
      <div {...{ [SESSION_GUARD_IGNORE_ATTRIBUTE]: "" }}>
        <input type="text" />
      </div>
    );

    type(container.querySelector("input")!, "Ortiz");

    expect(hasUnsavedChanges()).toBe(false);
  });

  it("does not track a field carrying the attribute itself", () => {
    stop = trackTypedInput();
    const { container } = render(<input type="text" data-session-guard-ignore="" />);

    type(container.querySelector("input")!, "Ortiz");

    expect(hasUnsavedChanges()).toBe(false);
  });

  it("tracks a contenteditable host by its text", () => {
    stop = trackTypedInput();
    const { container } = render(
      <div contentEditable suppressContentEditableWarning data-testid="host">
        <p>
          <span>typed</span>
        </p>
      </div>
    );
    const span = container.querySelector("span")!;

    fireEvent.input(span);
    expect(hasUnsavedChanges()).toBe(true);

    // Clear through the text node, so the span (the event target) stays
    // connected: what releases the hold is the host's text, not a removal.
    span.firstChild!.textContent = "";
    expect(span.isConnected).toBe(true);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("records the OUTER host of nested contenteditables", () => {
    stop = trackTypedInput();
    const { container } = render(
      <div contentEditable suppressContentEditableWarning data-testid="outer">
        outer text{" "}
        <span contentEditable suppressContentEditableWarning data-testid="inner">
          inner text
        </span>
      </div>
    );
    const inner = container.querySelector("[data-testid=inner]")!;

    fireEvent.input(inner);
    expect(hasUnsavedChanges()).toBe(true);

    // The inner element is now blank, but the outer host (the edit) is not.
    inner.firstChild!.textContent = "";
    expect(inner.textContent).toBe("");
    expect(hasUnsavedChanges()).toBe(true);

    for (const node of Array.from(container.querySelector("[data-testid=outer]")!.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) node.textContent = "";
    }
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("does not track an element inside contenteditable=false", () => {
    stop = trackTypedInput();
    const { container } = render(
      <div contentEditable={false}>
        <span>fixed</span>
      </div>
    );

    fireEvent.input(container.querySelector("span")!);

    expect(hasUnsavedChanges()).toBe(false);
  });

  it("records nothing before tracking starts, and forgets everything when it stops", () => {
    const { container } = render(<textarea />);
    const area = container.querySelector("textarea")!;

    type(area, "before");
    expect(hasUnsavedChanges()).toBe(false);

    stop = trackTypedInput();
    type(area, "during");
    expect(hasUnsavedChanges()).toBe(true);

    stop();
    stop = undefined;
    expect(hasUnsavedChanges()).toBe(false);
    type(area, "after");
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("shares one listener between nested users; a double stop is harmless", () => {
    const stopOuter = trackTypedInput();
    const stopInner = trackTypedInput();
    const { container } = render(<textarea />);
    const area = container.querySelector("textarea")!;

    stopInner();
    stopInner();
    type(area, "still tracked by the outer user");
    expect(hasUnsavedChanges()).toBe(true);

    stopOuter();
    expect(hasUnsavedChanges()).toBe(false);
  });
});

describe("useUnsavedChanges", () => {
  it("holds while dirty, and releases on clean or unmount", () => {
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: false },
    });
    expect(hasUnsavedChanges()).toBe(false);

    rerender({ dirty: true });
    expect(hasUnsavedChanges()).toBe(true);

    rerender({ dirty: false });
    expect(hasUnsavedChanges()).toBe(false);

    rerender({ dirty: true });
    unmount();
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("holds until every dirty component is clean", () => {
    const a = renderHook(() => useUnsavedChanges(true));
    const b = renderHook(() => useUnsavedChanges(true));

    a.unmount();
    expect(hasUnsavedChanges()).toBe(true);
    b.unmount();
    expect(hasUnsavedChanges()).toBe(false);
  });
});
