import { describe, it, expect } from "vitest";
import { quickActionErrorMessage } from "@/components/processing/quick-action-error";

describe("quickActionErrorMessage", () => {
  it.each([
    "Failed to fetch", // Chromium, Edge
    "Load failed", // Safari
    "NetworkError when attempting to fetch resource.", // Firefox
  ])("says nothing was saved when fetch rejects with TypeError(%j)", (text) => {
    for (const hadAttachments of [true, false]) {
      const message = quickActionErrorMessage(new TypeError(text), hadAttachments);
      expect(message).toMatch(/didn't reach the server, so nothing was saved/);
      expect(message).toMatch(/synced folder/);
    }
  });

  it("warns about a partial save when the server failed with attachments", () => {
    const message = quickActionErrorMessage(new Error("An error occurred in the Server Components render."), true);
    expect(message).toMatch(/Check the list below before trying again/);
    expect(message).toMatch(/without its attachment/);
  });

  it("asks for a plain retry when the server failed without attachments", () => {
    expect(quickActionErrorMessage(new Error("Failed to create milestone"), false)).toBe(
      "This couldn't be saved. Please try again.",
    );
  });

  it("treats a non-Error rejection as a server failure", () => {
    expect(quickActionErrorMessage("boom", false)).toBe("This couldn't be saved. Please try again.");
  });

  it("never echoes the underlying error text", () => {
    const message = quickActionErrorMessage(new Error("Contact 123 <script>"), true);
    expect(message).not.toMatch(/123|script/);
  });
});
