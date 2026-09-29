// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Guard for `assertAuthEnvironment` in src/lib/auth.ts (upstream MPNext
 * fd7fc4a, without its NEXTAUTH_SECRET fallback).
 *
 * With no secret, better-auth signs sessions with its PUBLIC default secret
 * and refuses that only when NODE_ENV is "production"; a truthy `TEST` skips
 * its validation entirely. With no database a known secret means anyone can
 * mint a session for any userGuid. These tests prove that IMPORTING
 * `@/lib/auth` throws for each bad configuration — removing the module-level
 * call (or any single check) turns them red — and that `next build` is still
 * exempt.
 *
 * `fetch` throws, so nothing here can leave the process.
 */

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = vi.fn().mockResolvedValue([]);
  },
}));

const GOOD_SECRET = "a-perfectly-fine-test-secret-0123456789";
const KEYS = ["BETTER_AUTH_SECRET", "NEXTAUTH_SECRET", "BETTER_AUTH_SECRETS", "NODE_ENV", "TEST", "NEXT_PHASE"] as const;
type Key = (typeof KEYS)[number];
let saved: Record<string, string | undefined>;

/** Sets the env for one import; `undefined` deletes the variable. */
function setEnv(values: Partial<Record<Key, string | undefined>>) {
  const env = process.env as Record<string, string | undefined>;
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
}

/** A clean, valid environment plus `overrides`, then a FRESH import of the module. */
function importAuthWith(overrides: Partial<Record<Key, string | undefined>>) {
  setEnv({
    BETTER_AUTH_SECRET: GOOD_SECRET,
    NEXTAUTH_SECRET: undefined,
    BETTER_AUTH_SECRETS: undefined,
    NODE_ENV: "development",
    TEST: undefined,
    NEXT_PHASE: undefined,
    ...overrides,
  });
  vi.resetModules();
  return import("@/lib/auth");
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      throw new Error(`Blocked unexpected fetch in test: ${String(input)}`);
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  setEnv(saved);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("assertAuthEnvironment at module load", () => {
  it("control: a valid secret imports cleanly", async () => {
    await expect(importAuthWith({})).resolves.toHaveProperty("auth");
  });

  it("control: a valid secret imports cleanly on a production process with no TEST", async () => {
    await expect(importAuthWith({ NODE_ENV: "production" })).resolves.toHaveProperty("auth");
  });

  it("refuses to import with no secret at all (NODE_ENV unset)", async () => {
    await expect(importAuthWith({ BETTER_AUTH_SECRET: undefined, NODE_ENV: undefined })).rejects.toThrow(
      /BETTER_AUTH_SECRET is not set/,
    );
  });

  it("refuses to import with an empty secret", async () => {
    await expect(importAuthWith({ BETTER_AUTH_SECRET: "" })).rejects.toThrow(/BETTER_AUTH_SECRET is not set/);
  });

  it("does NOT accept NEXTAUTH_SECRET as a fallback", async () => {
    await expect(importAuthWith({ BETTER_AUTH_SECRET: undefined, NEXTAUTH_SECRET: GOOD_SECRET })).rejects.toThrow(
      /BETTER_AUTH_SECRET is not set/,
    );
  });

  it("refuses better-auth's public default secret, even outside production", async () => {
    await expect(importAuthWith({ BETTER_AUTH_SECRET: "better-auth-secret-12345678901234567890" })).rejects.toThrow(
      /public default secret/,
    );
  });

  it("refuses a secret shorter than 32 characters", async () => {
    await expect(importAuthWith({ BETTER_AUTH_SECRET: "x".repeat(31) })).rejects.toThrow(/at least 32 characters/);
  });

  it("accepts a secret of exactly 32 characters", async () => {
    await expect(importAuthWith({ BETTER_AUTH_SECRET: "x".repeat(32) })).resolves.toHaveProperty("auth");
  });

  it("refuses to import when BETTER_AUTH_SECRETS would silently override the validated secret", async () => {
    await expect(importAuthWith({ BETTER_AUTH_SECRETS: "1:some-other-secret-value-0123456789" })).rejects.toThrow(
      /BETTER_AUTH_SECRETS is set/,
    );
  });

  it.each(["1", "true", "yes"])("refuses TEST=%s on a production process", async (flag) => {
    await expect(importAuthWith({ NODE_ENV: "production", TEST: flag })).rejects.toThrow(
      /TEST is set on a production process/,
    );
  });

  it("allows TEST=false on a production process (better-auth reads it as false too)", async () => {
    await expect(importAuthWith({ NODE_ENV: "production", TEST: "false" })).resolves.toHaveProperty("auth");
  });

  it("never puts the secret in the error message", async () => {
    const shortSecret = "short-but-secret";
    const error = await importAuthWith({ BETTER_AUTH_SECRET: shortSecret }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(shortSecret);
  });

  it("is skipped during next build (NEXT_PHASE=phase-production-build), which runs with no secret", async () => {
    await expect(
      importAuthWith({ BETTER_AUTH_SECRET: undefined, NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }),
    ).resolves.toHaveProperty("auth");
  });

  it("is NOT skipped at runtime (NEXT_PHASE=phase-production-server)", async () => {
    await expect(
      importAuthWith({ BETTER_AUTH_SECRET: undefined, NODE_ENV: "production", NEXT_PHASE: "phase-production-server" }),
    ).rejects.toThrow(/BETTER_AUTH_SECRET is not set/);
  });
});

describe("assertAuthEnvironment (pure function)", () => {
  it("accepts a valid configuration and rejects each bad one", async () => {
    const { assertAuthEnvironment } = await importAuthWith({});
    expect(() => assertAuthEnvironment({ BETTER_AUTH_SECRET: GOOD_SECRET, NODE_ENV: "production" })).not.toThrow();
    expect(() => assertAuthEnvironment({})).toThrow(/not set/);
    expect(() => assertAuthEnvironment({ BETTER_AUTH_SECRET: "short" })).toThrow(/at least 32/);
  });

  it("pins MIN_AUTH_SECRET_LENGTH and the default secret better-auth ships (drift guard)", async () => {
    const { BETTER_AUTH_DEFAULT_SECRET, MIN_AUTH_SECRET_LENGTH } = await importAuthWith({});
    expect(MIN_AUTH_SECRET_LENGTH).toBe(32);
    // DEFAULT_SECRET is not exported by better-auth; read its source instead.
    const constants = readFileSync(
      path.join(process.cwd(), "node_modules/better-auth/dist/utils/constants.mjs"),
      "utf8",
    );
    expect(constants).toContain(`DEFAULT_SECRET = "${BETTER_AUTH_DEFAULT_SECRET}"`);
  });
});

describe("advanced.disableOriginCheck", () => {
  it("is pinned to false, so a truthy TEST cannot switch the origin check off", async () => {
    // Vitest itself sets TEST=true, so without the pin skipOriginCheck would
    // be true right here.
    const { auth } = await importAuthWith({ NODE_ENV: "test", TEST: "true" });
    expect(auth.options.advanced?.disableOriginCheck).toBe(false);
    const context = await auth.$context;
    expect(context.skipOriginCheck).toBe(false);
  });
});
