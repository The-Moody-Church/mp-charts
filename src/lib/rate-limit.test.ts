import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, enforceRateLimit, RATE_LIMITS, _resetForTesting } from "./rate-limit";

beforeEach(() => {
  _resetForTesting();
});

describe("checkRateLimit", () => {
  it("allows requests within the limit", () => {
    for (let i = 0; i < RATE_LIMITS.general.limit; i++) {
      const result = checkRateLimit("user-1", "general");
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests exceeding the limit", () => {
    for (let i = 0; i < RATE_LIMITS.general.limit; i++) {
      checkRateLimit("user-1", "general");
    }
    const result = checkRateLimit("user-1", "general");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("tracks users independently", () => {
    for (let i = 0; i < RATE_LIMITS.general.limit; i++) {
      checkRateLimit("user-1", "general");
    }
    // user-1 is blocked
    expect(checkRateLimit("user-1", "general").allowed).toBe(false);
    // user-2 is not
    expect(checkRateLimit("user-2", "general").allowed).toBe(true);
  });

  it("tracks tiers independently", () => {
    // Exhaust the write limit (30/min)
    for (let i = 0; i < RATE_LIMITS.write.limit; i++) {
      checkRateLimit("user-1", "write");
    }
    expect(checkRateLimit("user-1", "write").allowed).toBe(false);
    // General tier still works
    expect(checkRateLimit("user-1", "general").allowed).toBe(true);
  });

  it("respects the upload tier limit (10 per 10min)", () => {
    for (let i = 0; i < RATE_LIMITS.upload.limit; i++) {
      const result = checkRateLimit("user-1", "upload");
      expect(result.allowed).toBe(true);
    }
    expect(checkRateLimit("user-1", "upload").allowed).toBe(false);
  });
});

describe("enforceRateLimit", () => {
  it("does not throw when within limits", () => {
    expect(() => enforceRateLimit("user-1", "write")).not.toThrow();
  });

  it("throws when limit exceeded", () => {
    for (let i = 0; i < RATE_LIMITS.write.limit; i++) {
      enforceRateLimit("user-1", "write");
    }
    expect(() => enforceRateLimit("user-1", "write")).toThrow(/Rate limit exceeded/);
  });
});
