import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { rememberIdToken, takeIdToken, __resetIdTokenStore } from "./id-token-store";

const GUID = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

beforeEach(() => __resetIdTokenStore());
afterEach(() => vi.useRealTimers());

describe("id token store", () => {
  it("returns what sign-in put there", () => {
    rememberIdToken(GUID, "a.b.c");
    expect(takeIdToken(GUID)).toBe("a.b.c");
  });

  it("REMOVES the entry on read", () => {
    // It has served its one purpose. Holding an identity assertion longer than
    // needed buys nothing.
    rememberIdToken(GUID, "a.b.c");
    expect(takeIdToken(GUID)).toBe("a.b.c");
    expect(takeIdToken(GUID)).toBeNull();
  });

  it("does not leak one user's token to another", () => {
    rememberIdToken(GUID, "mine");
    expect(takeIdToken(OTHER)).toBeNull();
    expect(takeIdToken(GUID)).toBe("mine");
  });

  it("returns null rather than throwing when nothing was stored", () => {
    // The normal state after a container restart. Sign-out must not depend on
    // this succeeding — the caller degrades to no hint.
    expect(takeIdToken(GUID)).toBeNull();
    expect(takeIdToken(null)).toBeNull();
    expect(takeIdToken(undefined)).toBeNull();
  });

  it("ignores a missing token instead of storing a falsy entry", () => {
    rememberIdToken(GUID, undefined);
    rememberIdToken(GUID, null);
    rememberIdToken(GUID, "");
    expect(takeIdToken(GUID)).toBeNull();
  });

  it("ignores a missing key", () => {
    rememberIdToken("", "a.b.c");
    expect(takeIdToken("")).toBeNull();
  });

  it("keeps the newest token when a user signs in again", () => {
    rememberIdToken(GUID, "first");
    rememberIdToken(GUID, "second");
    expect(takeIdToken(GUID)).toBe("second");
  });

  it("expires entries rather than holding them indefinitely", () => {
    vi.useFakeTimers();
    rememberIdToken(GUID, "a.b.c");
    vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    expect(takeIdToken(GUID)).toBeNull();
  });

  it("is bounded, so it cannot grow without limit", () => {
    // 500 is the cap. Write past it and the oldest must be evicted, not kept.
    for (let i = 0; i < 520; i++) {
      rememberIdToken(`guid-${i}`, `token-${i}`);
    }
    expect(takeIdToken("guid-0")).toBeNull();
    expect(takeIdToken("guid-519")).toBe("token-519");
  });

  it("survives module re-instantiation, which is the entire point", () => {
    // The account lookup this replaces failed precisely because sign-in and
    // sign-out can run in different bundles with different module instances.
    // Pinning to globalThis is what makes the value cross that boundary, so
    // assert it is actually there rather than in a module-local const.
    rememberIdToken(GUID, "a.b.c");
    const g = globalThis as typeof globalThis & { __mpIdTokens?: Map<string, unknown> };
    expect(g.__mpIdTokens?.has(GUID)).toBe(true);
  });
});
