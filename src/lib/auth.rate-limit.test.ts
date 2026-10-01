// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Guard for the rate limiter's client-IP source (`parseIpAddressOptions`,
 * upstream MPNext 0f61f54) and our `/sign-in/social` rule
 * (`authRateLimitCustomRules`).
 *
 * better-auth decides "test mode" ONCE, when it is first loaded
 * (@better-auth/core env-impl: `NODE_ENV === "test" || TEST`), and in test
 * mode `getIP` falls back to 127.0.0.1 — which would hide the production
 * behaviour this file exists to pin. So the hoisted block below runs before
 * better-auth is imported and makes this worker look like production. Vitest
 * isolates each test file, so no other file sees it. The first test proves
 * the switch took.
 *
 * The same block sets AUTH_IP_ADDRESS_HEADERS / AUTH_TRUSTED_PROXIES before
 * src/lib/auth.ts loads, so the real `auth` instance is built from them and a
 * test can prove it reads them. Every other test builds its own instance from
 * an explicit env object (`instance()` below), so they are unaffected.
 *
 * No network: sign-in/social only builds an authorize URL.
 */
vi.hoisted(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  delete process.env.TEST;
  process.env.AUTH_IP_ADDRESS_HEADERS = "CF-Connecting-IP";
  process.env.AUTH_TRUSTED_PROXIES = "10.0.0.0/24";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    throw new Error(`Blocked unexpected fetch in test: ${String(input)}`);
  }) as typeof fetch;
});

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = vi.fn().mockResolvedValue([]);
  },
}));

import { betterAuth } from "better-auth";
import { getIP } from "@better-auth/core/utils/ip";
import { auth, parseIpAddressOptions, authRateLimitCustomRules } from "@/lib/auth";
import { MP_PROVIDER_ID } from "@/lib/auth-endsession";

const ORIGIN = "http://localhost:3000"; // BETTER_AUTH_URL in src/test-setup.ts
const RATE_LIMIT_WARNING = "Rate limiting could not determine a client IP";

let warnings: string[];
/** Every warning logged in this file, across tests (see the one-warning test). */
const allWarnings: string[] = [];

/** The real auth options, with the given IP env and our (or no) custom rules. */
function instance(env: Record<string, string>, { customRules = true } = {}) {
  return betterAuth({
    ...auth.options,
    advanced: { ...auth.options.advanced, ipAddress: parseIpAddressOptions(env) },
    rateLimit: customRules ? { ...auth.options.rateLimit } : {},
    logger: {
      level: "warn",
      log: (_level: string, message: string) => {
        warnings.push(message);
        allWarnings.push(message);
      },
    },
  });
}

const signIn = (inst: ReturnType<typeof instance>, headers: Record<string, string> = {}) =>
  inst.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: JSON.stringify({ provider: MP_PROVIDER_ID, callbackURL: "/" }),
    }),
  );

/** Sends `n` sign-in starts and returns their statuses. */
async function burst(inst: ReturnType<typeof instance>, n: number, headers: Record<string, string> = {}) {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) statuses.push((await signIn(inst, headers)).status);
  return statuses;
}

// better-auth's in-memory rate-limit store is module-level, shared by every
// instance in this file. Each test starts a minute after the last one, so no
// test inherits another's buckets.
let clock = new Date("2026-09-29T08:00:00Z").getTime();
beforeEach(() => {
  warnings = [];
  clock += 60_000;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(clock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("this file runs better-auth in production mode", () => {
  it("rate limiting is on by default and getIP has no localhost fallback", async () => {
    const inst = instance({});
    expect((await inst.$context).rateLimit.enabled).toBe(true);
    expect(getIP(new Headers(), { advanced: {} })).toBeNull();
  });
});

describe("parseIpAddressOptions", () => {
  it("returns nothing when unconfigured (better-auth default: single-value x-forwarded-for)", () => {
    expect(parseIpAddressOptions({})).toEqual({});
    expect(parseIpAddressOptions({ AUTH_IP_ADDRESS_HEADERS: " , ", AUTH_TRUSTED_PROXIES: "" })).toEqual({});
  });

  it("parses, trims and lower-cases header names in order", () => {
    expect(parseIpAddressOptions({ AUTH_IP_ADDRESS_HEADERS: " CF-Connecting-IP , x-forwarded-for " })).toEqual({
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
    });
  });

  it("parses trusted proxies (IPv4, IPv6, CIDR)", () => {
    expect(parseIpAddressOptions({ AUTH_TRUSTED_PROXIES: "10.0.0.5, 10.1.0.0/16,2001:db8::/32, ::1" })).toEqual({
      trustedProxies: ["10.0.0.5", "10.1.0.0/16", "2001:db8::/32", "::1"],
    });
  });

  it.each(["x forwarded for", "x-ip;evil", "x_real_ip"])("refuses an invalid header name: %s", (h) => {
    expect(() => parseIpAddressOptions({ AUTH_IP_ADDRESS_HEADERS: h })).toThrow(
      /AUTH_IP_ADDRESS_HEADERS has invalid header names/,
    );
  });

  it.each([
    "10.0.0.300",
    "proxy.local",
    "10.0.0.0/33",
    "2001:db8::/129",
    "10.0.0.0/",
    "10.0.0.0/x",
    "10.0.0.0/0016",
    // node:net isIP accepts these; better-auth's own parser rejects them and
    // would only warn and drop them. A zone id, and an IPv4-mapped address
    // (better-auth maps it to 4 bytes, so /32 is the most it allows).
    "fe80::1%lo0",
    "fe80::1%eth0/64",
    "::ffff:10.0.0.0/104",
    "::ffff:1.2.3.4/120",
  ])(
    "refuses an invalid trusted proxy: %s",
    (p) => {
      expect(() => parseIpAddressOptions({ AUTH_TRUSTED_PROXIES: p })).toThrow(
        /AUTH_TRUSTED_PROXIES has entries that are not an IP address or CIDR range/,
      );
    },
  );

  it("accepts only entries better-auth parses too, so its 'Ignoring invalid' warning cannot fire", async () => {
    const IGNORED = "Ignoring invalid `advanced.ipAddress.trustedProxies` entries";
    const entries = ["10.0.0.5", "fe80::1%lo0", "::ffff:10.0.0.0/104", "::ffff:1.2.3.4/32", "2001:db8::/32"];
    const accepted = entries.filter((e) => {
      try {
        parseIpAddressOptions({ AUTH_TRUSTED_PROXIES: e });
        return true;
      } catch {
        return false;
      }
    });
    expect(accepted).toEqual(["10.0.0.5", "::ffff:1.2.3.4/32", "2001:db8::/32"]);
    await instance({ AUTH_TRUSTED_PROXIES: accepted.join(",") }).$context;
    expect(warnings.some((w) => w.includes(IGNORED))).toBe(false);

    // Negative control: handed to better-auth directly, a refused entry is
    // only warned about and dropped — the silent fallback the check prevents.
    await betterAuth({
      ...auth.options,
      advanced: { ...auth.options.advanced, ipAddress: { trustedProxies: ["fe80::1%lo0"] } },
      logger: { level: "warn", log: (_level: string, message: string) => void warnings.push(message) },
    }).$context;
    expect(warnings.some((w) => w.includes(`${IGNORED}: fe80::1%lo0.`))).toBe(true);
  });

  it("is what the real auth instance uses: read from AUTH_IP_ADDRESS_HEADERS / AUTH_TRUSTED_PROXIES", () => {
    // Set in the hoisted block, before src/lib/auth.ts loaded.
    expect(auth.options.advanced?.ipAddress).toEqual({
      ipAddressHeaders: ["cf-connecting-ip"],
      trustedProxies: ["10.0.0.0/24"],
    });
  });
});

describe("the /sign-in/social rate-limit rule", () => {
  it("pins 10 requests per 10 s on the real instance", () => {
    expect(authRateLimitCustomRules).toEqual({ "/sign-in/social": { window: 10, max: 10 } });
    expect(auth.options.rateLimit?.customRules).toBe(authRateLimitCustomRules);
  });

  it("lets one client start 10 sign-ins in 10 s and refuses the 11th", async () => {
    const inst = instance({ AUTH_IP_ADDRESS_HEADERS: "cf-connecting-ip" });
    const statuses = await burst(inst, 11, { "cf-connecting-ip": "203.0.113.10" });
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("negative control: without the rule, better-auth's built-in 3 per 10 s applies", async () => {
    const inst = instance({ AUTH_IP_ADDRESS_HEADERS: "cf-connecting-ip" }, { customRules: false });
    expect(await burst(inst, 4, { "cf-connecting-ip": "203.0.113.11" })).toEqual([200, 200, 200, 429]);
  });
});

describe("which client IP the limiter keys on", () => {
  it("configured cf-connecting-ip: each client has its own bucket, and x-forwarded-for is ignored", async () => {
    const inst = instance({ AUTH_IP_ADDRESS_HEADERS: "cf-connecting-ip" });
    await burst(inst, 10, { "cf-connecting-ip": "203.0.113.20", "x-forwarded-for": "198.51.100.1" });
    expect((await signIn(inst, { "cf-connecting-ip": "203.0.113.20", "x-forwarded-for": "198.51.100.2" })).status).toBe(429);
    expect((await signIn(inst, { "cf-connecting-ip": "203.0.113.21", "x-forwarded-for": "198.51.100.1" })).status).toBe(200);
    expect(warnings.some((w) => w.includes(RATE_LIMIT_WARNING))).toBe(false);
  });

  it("configured header MISSING: not skipped — one shared bucket for everyone, and one warning", async () => {
    const inst = instance({ AUTH_IP_ADDRESS_HEADERS: "cf-connecting-ip" });
    // Ten different "clients", told apart only by x-forwarded-for, which is no
    // longer consulted once AUTH_IP_ADDRESS_HEADERS is set.
    for (let i = 0; i < 10; i++) {
      expect((await signIn(inst, { "x-forwarded-for": `198.51.100.${i + 1}` })).status).toBe(200);
    }
    expect((await signIn(inst, { "x-forwarded-for": "198.51.100.99" })).status).toBe(429);
    // A request that does carry the header is in its own bucket.
    expect((await signIn(inst, { "cf-connecting-ip": "203.0.113.30" })).status).toBe(200);
    // better-auth logs it once per PROCESS (a module-level flag), so which
    // test logs it depends on the order tests run in (another test here also
    // sends an unresolvable IP). Count across the whole file: by now it has
    // been logged, and exactly once.
    expect(allWarnings.filter((w) => w.includes(RATE_LIMIT_WARNING))).toHaveLength(1);
  });

  it("unconfigured (today): a single-valued x-forwarded-for is the client", async () => {
    const inst = instance({});
    await burst(inst, 10, { "x-forwarded-for": "198.51.100.40" });
    expect((await signIn(inst, { "x-forwarded-for": "198.51.100.40" })).status).toBe(429);
    expect((await signIn(inst, { "x-forwarded-for": "198.51.100.41" })).status).toBe(200);
  });

  it("unconfigured (today): a multi-hop x-forwarded-for is unresolved, so it shares one bucket", async () => {
    const inst = instance({});
    for (let i = 0; i < 10; i++) {
      expect((await signIn(inst, { "x-forwarded-for": `198.51.100.${i + 50}, 10.0.0.5` })).status).toBe(200);
    }
    expect((await signIn(inst, { "x-forwarded-for": "198.51.100.99, 10.0.0.5" })).status).toBe(429);
  });

  it("trusted proxies: the first untrusted hop from the right is the client", async () => {
    const inst = instance({ AUTH_TRUSTED_PROXIES: "10.0.0.0/24" });
    await burst(inst, 10, { "x-forwarded-for": "198.51.100.60, 10.0.0.5" });
    expect((await signIn(inst, { "x-forwarded-for": "198.51.100.60, 10.0.0.5" })).status).toBe(429);
    expect((await signIn(inst, { "x-forwarded-for": "198.51.100.61, 10.0.0.5" })).status).toBe(200);
  });
});
