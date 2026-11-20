import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SIGN_IN_LOOP_STORAGE_KEY,
  SIGN_IN_LOOP_WINDOW_MS,
  clearSignInLoop,
  isSignInLoopStopped,
  recordAutomaticSignInNavigation,
  subscribeSignInLoopStop,
} from "./sign-in-loop";

/** The /signin loop cap (upstream MPNext 595ecab, adapted). */
describe("sign-in loop cap", () => {
  const T = 1_800_000_000_000;

  beforeEach(() => {
    clearSignInLoop();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows two automatic navigations in the window and refuses the third", () => {
    expect(recordAutomaticSignInNavigation(T)).toBe(true);
    expect(recordAutomaticSignInNavigation(T + 1_000)).toBe(true);
    expect(isSignInLoopStopped()).toBe(false);

    expect(recordAutomaticSignInNavigation(T + 2_000)).toBe(false);
    expect(isSignInLoopStopped()).toBe(true);
    // A refusal records nothing.
    expect(JSON.parse(sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY)!)).toEqual([T, T + 1_000]);
  });

  it("allows again once the earlier navigations are older than the window", () => {
    recordAutomaticSignInNavigation(T);
    recordAutomaticSignInNavigation(T + 1_000);

    expect(recordAutomaticSignInNavigation(T + SIGN_IN_LOOP_WINDOW_MS - 1)).toBe(false);
    expect(recordAutomaticSignInNavigation(T + SIGN_IN_LOOP_WINDOW_MS + 1_000)).toBe(true);
  });

  it("drops an entry exactly when it is a full window old", () => {
    expect(recordAutomaticSignInNavigation(T)).toBe(true);
    expect(recordAutomaticSignInNavigation(T)).toBe(true);

    expect(recordAutomaticSignInNavigation(T + SIGN_IN_LOOP_WINDOW_MS - 1)).toBe(false);
    expect(isSignInLoopStopped()).toBe(true);

    // Both entries are now exactly one window old, so both drop.
    expect(recordAutomaticSignInNavigation(T + SIGN_IN_LOOP_WINDOW_MS)).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY)!)).toEqual([T + SIGN_IN_LOOP_WINDOW_MS]);
  });

  it("clearSignInLoop forgets the navigations and lowers the stop flag, notifying subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSignInLoopStop(listener);
    recordAutomaticSignInNavigation(T);
    recordAutomaticSignInNavigation(T);
    recordAutomaticSignInNavigation(T);
    expect(listener).toHaveBeenCalledTimes(1);

    clearSignInLoop();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(isSignInLoopStopped()).toBe(false);
    expect(sessionStorage.getItem(SIGN_IN_LOOP_STORAGE_KEY)).toBeNull();
    expect(recordAutomaticSignInNavigation(T)).toBe(true);
    unsubscribe();
  });

  it.each([
    ["not JSON", "{"],
    ["not an array", '{"a":1}'],
    ["non-numbers", '["x", null, 1e400]'],
    ["future timestamps", JSON.stringify([T + 60_000, T + 90_000])],
  ])("reads %s as no recent navigations", (_label, stored) => {
    sessionStorage.setItem(SIGN_IN_LOOP_STORAGE_KEY, stored);

    expect(recordAutomaticSignInNavigation(T)).toBe(true);
    expect(recordAutomaticSignInNavigation(T)).toBe(true);
  });

  it("fails open when storage throws on every access", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    for (let i = 0; i < 5; i++) expect(recordAutomaticSignInNavigation(T + i)).toBe(true);
    expect(() => clearSignInLoop()).not.toThrow();
  });

  it("fails open when sessionStorage itself is inaccessible", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(recordAutomaticSignInNavigation(T)).toBe(true);
    expect(recordAutomaticSignInNavigation(T)).toBe(true);
    expect(recordAutomaticSignInNavigation(T)).toBe(true);
    expect(() => clearSignInLoop()).not.toThrow();
  });
});
