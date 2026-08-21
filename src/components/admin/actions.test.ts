import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireFeatureAccess = vi.fn();
const mockLoadFeatureAccess = vi.fn();
const mockSaveFeatureAccess = vi.fn();
const mockEnforceRateLimit = vi.fn();

vi.mock("@/lib/authorization", () => ({
  requireFeatureAccess: (...args: unknown[]) => mockRequireFeatureAccess(...args),
  loadFeatureAccess: () => mockLoadFeatureAccess(),
  saveFeatureAccess: (...args: unknown[]) => mockSaveFeatureAccess(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => mockEnforceRateLimit(...args),
}));

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = vi.fn().mockResolvedValue([]);
  },
}));

vi.mock("@/services/userService", () => ({
  UserService: { getInstance: vi.fn() },
}));

import { updateFeatureAccess } from "@/components/admin/actions";

/** Mirrors loadFeatureAccess(): a prototype-bearing object, not a null-prototype map. */
function freshConfig() {
  return {
    dashboard: { label: "Dashboard", description: "d", allowedGroupIds: [1] },
  };
}

describe("updateFeatureAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireFeatureAccess.mockResolvedValue({ user: { id: "user-1" } });
    mockLoadFeatureAccess.mockImplementation(() => freshConfig());
  });

  it("updates a known feature and persists it", async () => {
    const result = await updateFeatureAccess("dashboard", [7, 8]);

    expect(result).toEqual({ success: true });
    expect(mockSaveFeatureAccess).toHaveBeenCalledTimes(1);
    const saved = mockSaveFeatureAccess.mock.calls[0][0];
    expect(saved.dashboard.allowedGroupIds).toEqual([7, 8]);
  });

  it("enforces the write rate limit for the calling user", async () => {
    await updateFeatureAccess("dashboard", [1]);
    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1", "write");
  });

  // SECURITY regression: loadFeatureAccess() returns a prototype-bearing object, so
  // config["__proto__"] is truthy and slipped past the old `if (!config[feature])`
  // guard — the assignment then wrote onto Object.prototype for the life of the
  // process.
  it.each(["__proto__", "constructor", "prototype"])(
    "rejects %s as a feature name without polluting the prototype",
    async (key) => {
      const result = await updateFeatureAccess(key, [999]);

      expect(result).toEqual({ success: false, error: "Unknown feature" });
      expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
      expect(({} as Record<string, unknown>).allowedGroupIds).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, "allowedGroupIds")).toBe(false);
    }
  );

  it("rejects an unknown feature", async () => {
    const result = await updateFeatureAccess("not-a-feature", [1]);
    expect(result).toEqual({ success: false, error: "Unknown feature" });
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
  });

  // `allowedGroupIds: number[]` is a compile-time annotation only; the value goes
  // straight to disk, and that file survives redeploy on a named Docker volume.
  it.each([
    ["a non-array", "nope"],
    ["a number", 5],
    ["null", null],
    ["non-integer members", [1.5]],
    ["negative members", [-3]],
    ["zero", [0]],
    ["string members", ["7"]],
  ])("rejects %s for allowedGroupIds", async (_label, value) => {
    const result = await updateFeatureAccess("dashboard", value as unknown as number[]);

    expect(result).toEqual({ success: false, error: "Invalid group IDs" });
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
  });

  it("accepts an empty array", async () => {
    const result = await updateFeatureAccess("dashboard", []);
    expect(result).toEqual({ success: true });
    expect(mockSaveFeatureAccess.mock.calls[0][0].dashboard.allowedGroupIds).toEqual([]);
  });

  it("rejects more than 500 group IDs", async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => i + 1);
    const result = await updateFeatureAccess("dashboard", tooMany);
    expect(result).toEqual({ success: false, error: "Invalid group IDs" });
  });

  it("does not echo the feature name back to the caller", async () => {
    const result = await updateFeatureAccess("<script>alert(1)</script>", [1]);
    expect(result.error).toBe("Unknown feature");
    expect(result.error).not.toContain("script");
  });
});
