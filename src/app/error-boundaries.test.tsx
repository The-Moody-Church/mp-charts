import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { resolve } from "path";
import RootError from "./error";
import GlobalError from "./global-error";

/**
 * Error boundary guards.
 *
 * These pin the three things that are silently wrong rather than loudly
 * broken: the retry prop name, PII reaching the log, and global-error's
 * import isolation.
 */
// Resolved from the repo root: vitest does not give this file a file:// URL,
// so import.meta.url cannot be used here.
const GLOBAL_ERROR_SRC = resolve(process.cwd(), "src/app/global-error.tsx");

const makeError = (message: string, digest?: string) =>
  Object.assign(new Error(message), { digest });

const SENTINEL = "Jane Doe's pastoral note about her grief";

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ["RootError", RootError, "root"],
  ["GlobalError", GlobalError, "global"],
])("%s", (_name, Component, boundary) => {
  it("calls retry, not reset — Next 16 renamed the prop", () => {
    // A boundary wired to `reset` renders fine and its button silently does
    // less than it appears to: it clears error state without re-fetching.
    const retry = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Component error={makeError("boom")} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("never puts the error message in the log or on the page", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Component error={makeError(SENTINEL, "abc123")} retry={vi.fn()} />);

    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).not.toContain(SENTINEL);
    expect(logged).not.toContain("Jane Doe");
    expect(logged).toContain("ui.render.error");
    expect(logged).toContain(boundary);
    // digest is the join key to the un-redacted server log
    expect(logged).toContain("abc123");

    expect(document.body.textContent).not.toContain(SENTINEL);
    expect(document.body.textContent).not.toContain("Jane Doe");
  });

  it("surfaces the digest so a user can quote it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Component error={makeError("boom", "deadbeef")} retry={vi.fn()} />);

    expect(screen.getByText(/deadbeef/)).toBeDefined();
  });

  it("renders without a digest", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(<Component error={makeError("boom")} retry={vi.fn()} />);

    expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
  });
});

describe("GlobalError structural contract", () => {
  it("supplies its own html and body — it REPLACES the root layout", () => {
    // React 19 hoists <html>/<body>/<title> out of the render container, so
    // querying the DOM after render() would report them missing even though
    // the component returns them. Assert against the static markup instead.
    vi.spyOn(console, "error").mockImplementation(() => {});

    const html = renderToStaticMarkup(
      <GlobalError error={makeError("boom")} retry={vi.fn()} />
    );

    expect(html).toContain("<html");
    expect(html).toContain("<body");
  });

  it("imports nothing from the app", () => {
    // Whatever failed may be that very code. Enforced by reading the source,
    // because an import that happens to work in test would still be wrong.
    const src = readFileSync(GLOBAL_ERROR_SRC, "utf8");
    const appImports = [...src.matchAll(/from\s+["']([^"']+)["']/g)]
      .map((m) => m[1])
      .filter((s) => s.startsWith("@/") || s.startsWith("./") || s.startsWith("../"));

    expect(appImports).toEqual([]);
  });

  it("styles inline only — a nonce-based style-src would drop a stylesheet", () => {
    const src = readFileSync(GLOBAL_ERROR_SRC, "utf8");
    expect(src).not.toContain("className=");
  });
});
