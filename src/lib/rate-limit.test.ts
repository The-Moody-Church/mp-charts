import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

  it("includes retry-after seconds in error message", () => {
    for (let i = 0; i < RATE_LIMITS.write.limit; i++) {
      enforceRateLimit("user-1", "write");
    }
    try {
      enforceRateLimit("user-1", "write");
    } catch (e) {
      expect((e as Error).message).toMatch(/Try again in \d+ seconds/);
    }
  });
});

describe("retryAfterMs", () => {
  it("returns at least 1000ms when rate limited", () => {
    for (let i = 0; i < RATE_LIMITS.write.limit; i++) {
      checkRateLimit("user-1", "write");
    }
    const result = checkRateLimit("user-1", "write");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe("cleanup interval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    _resetForTesting();
  });

  it("cleans up stale entries after 5-minute interval", () => {
    // Make some requests to populate the log
    checkRateLimit("stale-user", "general");

    // Advance past the longest window (cacheRefresh = 1 hour) plus the cleanup interval (5 min)
    vi.advanceTimersByTime(3_600_000 + 300_000);

    // The stale entry should be cleaned up — next request creates a fresh entry
    const result = checkRateLimit("stale-user", "general");
    expect(result.allowed).toBe(true);
  });

  it("retains entries still within window during cleanup", () => {
    // Exhaust the write limit
    for (let i = 0; i < RATE_LIMITS.write.limit; i++) {
      checkRateLimit("active-user", "write");
    }

    // Advance 5 minutes — triggers cleanup, but write window is 60s, so entries are expired by then
    vi.advanceTimersByTime(300_000);

    // After cleanup, the entries are older than 60s window, so they should be pruned
    const result = checkRateLimit("active-user", "write");
    expect(result.allowed).toBe(true);
  });
});

/**
 * Finding #19 (2026-05-21 audit): a blank identity must be denied outright —
 * otherwise every id-less caller shares one ":tier" bucket.
 */
describe("blank userId fails closed", () => {
  it("denies an empty userId on the first call", () => {
    const result = checkRateLimit("", "general");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBe(RATE_LIMITS.general.windowMs);
    }
  });

  it("denies a whitespace-only userId", () => {
    expect(checkRateLimit("   ", "write").allowed).toBe(false);
  });

  it("enforceRateLimit throws for a blank userId", () => {
    expect(() => enforceRateLimit("", "general")).toThrow(/Rate limit exceeded/);
  });
});
