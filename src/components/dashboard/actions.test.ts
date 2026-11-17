import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const {
  mockRequireFeatureAccess,
  mockEnforceRateLimit,
  mockDeleteByPrefix,
  mockUpdateTag,
  mockRevalidatePath,
  mockRevalidateTag,
  mockGetCachedDashboardData,
  mockGetCachedFullRangeData,
  mockGetCachedExtendedData,
  mockGetCachedEngagementData,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockDeleteByPrefix: vi.fn(),
  mockUpdateTag: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockGetCachedDashboardData: vi.fn(),
  mockGetCachedFullRangeData: vi.fn(),
  mockGetCachedExtendedData: vi.fn(),
  mockGetCachedEngagementData: vi.fn(),
}));

vi.mock("next/cache", () => ({
  updateTag: mockUpdateTag,
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidateTag,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));
vi.mock("@/lib/authorization", () => ({ requireFeatureAccess: mockRequireFeatureAccess }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mockEnforceRateLimit }));
vi.mock("@/lib/service-cache", () => ({
  serviceCache: { deleteByPrefix: mockDeleteByPrefix, getOrFetch: vi.fn() },
  CACHE_TTL: { STANDARD: 1, LONG: 2 },
}));
vi.mock("@/components/dashboard/cached-data", () => ({
  getCachedDashboardData: mockGetCachedDashboardData,
  getCachedFullRangeData: mockGetCachedFullRangeData,
  getCachedExtendedData: mockGetCachedExtendedData,
  getCachedEngagementData: mockGetCachedEngagementData,
}));

import {
  getDashboardMetrics,
  getFullRangeDashboardMetrics,
  getExtendedDashboardMetrics,
  getEngagementDashboardMetrics,
  refreshDashboardCache,
} from "@/components/dashboard/actions";

const SESSION = { user: { id: "user-1" } };
const DATA = { marker: "dashboard-data" };

// getCurrentMinistryYear reads server-local time (getMonth/getFullYear), so the
// fake clock is set with the local-time Date constructor to stay TZ-independent.
function setLocalNow(year: number, monthIndex: number, day: number) {
  vi.setSystemTime(new Date(year, monthIndex, day, 12, 0, 0));
}

// Source files are read relative to this test file, not process.cwd(), so the
// source-inspection tests still work when vitest runs from another directory.
function readRepoFile(relativeToThisFile: string): string {
  return readFileSync(fileURLToPath(new URL(relativeToThisFile, import.meta.url)), "utf8");
}

// Node re-reads process.env.TZ on assignment, so a test can pin the server's
// local zone. Restored in afterEach; `delete` restores the system default.
const ORIGINAL_TZ = process.env.TZ;
function setServerTimeZone(tz: string) {
  process.env.TZ = tz;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  setLocalNow(2026, 10, 17); // 17 Nov 2026 -> ministry year 2026
  mockRequireFeatureAccess.mockResolvedValue(SESSION);
  mockEnforceRateLimit.mockImplementation(() => {});
  // clearMocks keeps implementations, so reset the ones error-path tests override.
  mockDeleteByPrefix.mockImplementation(() => {});
  mockUpdateTag.mockImplementation(() => {});
  mockGetCachedDashboardData.mockResolvedValue(DATA);
  mockGetCachedFullRangeData.mockResolvedValue(DATA);
  mockGetCachedExtendedData.mockResolvedValue(DATA);
  mockGetCachedEngagementData.mockResolvedValue(DATA);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// getDashboardMetrics
// ---------------------------------------------------------------------------
describe("getDashboardMetrics", () => {
  it("requires the dashboard feature before touching the cache", async () => {
    await expect(getDashboardMetrics(2025)).resolves.toBe(DATA);
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("dashboard");
    expect(mockRequireFeatureAccess.mock.invocationCallOrder[0]).toBeLessThan(
      mockGetCachedDashboardData.mock.invocationCallOrder[0],
    );
  });

  it("propagates an authorization failure and never reads the cache", async () => {
    mockRequireFeatureAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(getDashboardMetrics(2025)).rejects.toThrow("Forbidden");
    expect(mockGetCachedDashboardData).not.toHaveBeenCalled();
  });

  it("defaults to the current ministry year when no year is given", async () => {
    await getDashboardMetrics();
    expect(mockGetCachedDashboardData).toHaveBeenCalledWith(2026);
  });

  it("uses the previous calendar year before September (August is still the old ministry year)", async () => {
    setLocalNow(2026, 7, 31); // 31 Aug 2026
    await getDashboardMetrics();
    expect(mockGetCachedDashboardData).toHaveBeenCalledWith(2025);
  });

  it("rolls over to the new ministry year on 1 September", async () => {
    setLocalNow(2026, 8, 1); // 1 Sep 2026
    await getDashboardMetrics();
    expect(mockGetCachedDashboardData).toHaveBeenCalledWith(2026);
  });

  // The ministry year follows the SERVER's local calendar, not UTC and not Central.
  // Production runs in Docker with TZ unset (UTC), so there the rollover — and with
  // it every dashboard cache key — happens at Aug 31 19:00 CDT. These pin the
  // local-time reading: a getUTCMonth()/getUTCFullYear() version would disagree.
  it("reads the ministry year in server-local time: still August in Chicago when UTC is already September", async () => {
    setServerTimeZone("America/Chicago");
    vi.setSystemTime(new Date("2026-09-01T03:00:00Z")); // Aug 31 22:00 CDT
    await getDashboardMetrics();
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2025);
    await getFullRangeDashboardMetrics();
    expect(mockGetCachedFullRangeData).toHaveBeenLastCalledWith(2021, "2026-08-31");
  });

  it("reads the ministry year in server-local time: already September in Tokyo when UTC is still August", async () => {
    setServerTimeZone("Asia/Tokyo");
    vi.setSystemTime(new Date("2026-08-31T20:00:00Z")); // Sep 1 05:00 JST
    await getDashboardMetrics();
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2026);
  });

  it("rolls over at local midnight under UTC (the production container's zone)", async () => {
    setServerTimeZone("UTC");
    vi.setSystemTime(new Date("2026-08-31T23:59:59Z"));
    await getDashboardMetrics();
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2025);
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
    await getDashboardMetrics();
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2026);
  });

  it("passes through valid years at both ends of the window (current-10 .. current+1)", async () => {
    await getDashboardMetrics(2016);
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2016);
    await getDashboardMetrics(2027);
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2027);
    await getDashboardMetrics(2026);
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2026);
  });

  it.each([
    ["just below the window", 2015],
    ["just above the window", 2028],
    ["far future", 999999],
    ["negative", -1],
    ["zero", 0],
    ["fractional", 2025.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("clamps an out-of-range or non-integer year (%s) to the current ministry year", async (_label, year) => {
    await getDashboardMetrics(year);
    expect(mockGetCachedDashboardData).toHaveBeenCalledWith(2026);
  });

  it.each([
    ["numeric string", "2025"],
    ["injection-shaped string", "2025 OR 1=1"],
    ["null", null],
    ["object", { year: 2025 }],
  ])("treats a type-erased wire value (%s) as untrusted and falls back to the current year", async (_label, year) => {
    await getDashboardMetrics(year as unknown as number);
    expect(mockGetCachedDashboardData).toHaveBeenCalledWith(2026);
  });

  it("clamps relative to the current ministry year, not the calendar year", async () => {
    // 1 Feb 2027 is still ministry year 2026, so 2028 (current+2) is out of range
    // and 2027 (current+1) is the upper bound.
    setLocalNow(2027, 1, 1);
    await getDashboardMetrics(2028);
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2026);
    await getDashboardMetrics(2027);
    expect(mockGetCachedDashboardData).toHaveBeenLastCalledWith(2027);
  });

  it("propagates a cache/data error to the caller", async () => {
    mockGetCachedDashboardData.mockRejectedValue(new Error("MP down"));
    await expect(getDashboardMetrics(2026)).rejects.toThrow("MP down");
  });
});

// ---------------------------------------------------------------------------
// getFullRangeDashboardMetrics
// ---------------------------------------------------------------------------
describe("getFullRangeDashboardMetrics", () => {
  it("requests 5 ministry years with a stable Aug-31 end-date key", async () => {
    await expect(getFullRangeDashboardMetrics()).resolves.toBe(DATA);
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("dashboard");
    expect(mockGetCachedFullRangeData).toHaveBeenCalledWith(2022, "2027-08-31");
  });

  it("keeps the same cache key every day of a ministry year (Sep 1 .. Aug 31)", async () => {
    setLocalNow(2026, 8, 1);
    await getFullRangeDashboardMetrics();
    setLocalNow(2027, 2, 15);
    await getFullRangeDashboardMetrics();
    setLocalNow(2027, 7, 31);
    await getFullRangeDashboardMetrics();
    const keys = mockGetCachedFullRangeData.mock.calls.map((c) => JSON.stringify(c));
    expect(new Set(keys).size).toBe(1);
    expect(mockGetCachedFullRangeData).toHaveBeenCalledWith(2022, "2027-08-31");
  });

  it("changes the key at the ministry-year rollover", async () => {
    setLocalNow(2027, 8, 1); // 1 Sep 2027 -> ministry year 2027
    await getFullRangeDashboardMetrics();
    expect(mockGetCachedFullRangeData).toHaveBeenCalledWith(2023, "2028-08-31");
  });

  it("propagates an authorization failure and never reads the cache", async () => {
    mockRequireFeatureAccess.mockRejectedValue(new Error("Unauthorized"));
    await expect(getFullRangeDashboardMetrics()).rejects.toThrow("Unauthorized");
    expect(mockGetCachedFullRangeData).not.toHaveBeenCalled();
  });

  it("propagates a data error", async () => {
    mockGetCachedFullRangeData.mockRejectedValue(new Error("boom"));
    await expect(getFullRangeDashboardMetrics()).rejects.toThrow("boom");
  });
});

// ---------------------------------------------------------------------------
// getExtendedDashboardMetrics / getEngagementDashboardMetrics
// ---------------------------------------------------------------------------
describe.each([
  ["getExtendedDashboardMetrics", getExtendedDashboardMetrics, mockGetCachedExtendedData],
  ["getEngagementDashboardMetrics", getEngagementDashboardMetrics, mockGetCachedEngagementData],
] as const)("%s", (_name, action, cachedFn) => {
  it("requests the stable full range: Sep 1 of current-4 .. Aug 31 of current+1", async () => {
    await expect(action()).resolves.toBe(DATA);
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("dashboard");
    expect(cachedFn).toHaveBeenCalledWith("2022-09-01", "2027-08-31");
  });

  it("uses the previous ministry year's range in August", async () => {
    setLocalNow(2026, 7, 31);
    await action();
    expect(cachedFn).toHaveBeenCalledWith("2021-09-01", "2026-08-31");
  });

  it("keeps an identical key across days within the ministry year", async () => {
    setLocalNow(2026, 8, 1);
    await action();
    setLocalNow(2027, 5, 30);
    await action();
    expect(cachedFn.mock.calls[0]).toEqual(cachedFn.mock.calls[1]);
  });

  it("propagates an authorization failure and never reads the cache", async () => {
    mockRequireFeatureAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(action()).rejects.toThrow("Forbidden");
    expect(cachedFn).not.toHaveBeenCalled();
  });

  it("propagates a data error", async () => {
    cachedFn.mockRejectedValue(new Error("Activity_Log timeout"));
    await expect(action()).rejects.toThrow("Activity_Log timeout");
  });
});

// ---------------------------------------------------------------------------
// refreshDashboardCache
// ---------------------------------------------------------------------------
describe("refreshDashboardCache", () => {
  it("authorizes, rate-limits with the cacheRefresh tier, purges serviceCache, then expires the tags", async () => {
    const result = await refreshDashboardCache();

    expect(result.success).toBe(true);
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.timestamp.getTime()).toBe(Date.now());

    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("dashboard");
    expect(mockEnforceRateLimit).toHaveBeenCalledTimes(1);
    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1", "cacheRefresh");

    expect(mockDeleteByPrefix.mock.calls).toEqual([["dashboard"], ["group-types"]]);
    expect(mockUpdateTag.mock.calls).toEqual([["dashboard-data"], ["group-types"]]);
  });

  it("purges serviceCache BEFORE any updateTag (caching.md load-bearing rule)", async () => {
    await refreshDashboardCache();

    const authOrder = mockRequireFeatureAccess.mock.invocationCallOrder[0];
    const rateOrder = mockEnforceRateLimit.mock.invocationCallOrder[0];
    const purgeOrders = mockDeleteByPrefix.mock.invocationCallOrder;
    const tagOrders = mockUpdateTag.mock.invocationCallOrder;

    expect(authOrder).toBeLessThan(rateOrder);
    expect(rateOrder).toBeLessThan(Math.min(...purgeOrders));
    // Every purge happens before the first updateTag; otherwise the re-run
    // 'use cache' function would just return its own serviceCache value.
    expect(Math.max(...purgeOrders)).toBeLessThan(Math.min(...tagOrders));
  });

  it("never calls revalidatePath or revalidateTag", async () => {
    await refreshDashboardCache();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("does not import or call revalidatePath in source (it hard-purges the PPR shell)", () => {
    const src = readRepoFile("./actions.ts");
    // Strip comments: the source explains why revalidatePath is NOT used. Line
    // comments must start a line or follow whitespace, so a "//" inside a string
    // literal such as a URL is left alone.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
    expect(code).not.toMatch(/revalidatePath/);
  });

  it("purges prefixes that cover every serviceCache key the tagged caches use", async () => {
    await refreshDashboardCache();
    const purged = mockDeleteByPrefix.mock.calls.map((c) => c[0] as string);

    // Every serviceCache.getOrFetch() call in the 'use cache' sources must have a
    // key we can resolve to a literal prefix: an inline string/template literal, or
    // an identifier bound to one in the same file. A key we cannot resolve fails the
    // test instead of being skipped, so a refactor of the key style is caught here
    // rather than silently narrowing coverage. A new cached function whose key
    // starts with something else would otherwise survive the Refresh button.
    const keyPrefixes = [
      "./cached-data.ts",
      "../../services/dashboardService.ts",
    ].flatMap((file) => {
      const src = readRepoFile(file);
      return [...src.matchAll(/getOrFetch\(\s*([^,]+?)\s*,/g)].map((call) => {
        const arg = call[1];
        let literal = arg;
        if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
          // The nearest binding of that name before this call (each cached
          // function declares its own `const key`).
          const bindings = [
            ...src
              .slice(0, call.index)
              .matchAll(new RegExp(`(?:const|let)\\s+${arg}\\s*=\\s*([\`'"][^\`'"]*)`, "g")),
          ];
          const binding = bindings.at(-1);
          if (!binding) throw new Error(`${file}: cannot resolve getOrFetch key "${arg}"`);
          literal = binding[1];
        }
        const m = literal.match(/^[`'"]([^`'"$]*)/);
        if (!m || m[1] === "") throw new Error(`${file}: getOrFetch key "${arg}" has no literal prefix`);
        return m[1];
      });
    });

    expect(keyPrefixes.length).toBeGreaterThanOrEqual(5);
    for (const prefix of keyPrefixes) {
      expect(purged.some((p) => prefix.startsWith(p)), `key prefix "${prefix}" not purged`).toBe(true);
    }
  });

  it("returns success:false and touches no cache when authorization fails", async () => {
    mockRequireFeatureAccess.mockRejectedValue(new Error("Forbidden"));

    const result = await refreshDashboardCache();

    expect(result.success).toBe(false);
    expect(result.timestamp).toBeInstanceOf(Date);
    // The failure timestamp is "now" too, not a sentinel such as the epoch.
    expect(result.timestamp.getTime()).toBe(Date.now());
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
    expect(mockDeleteByPrefix).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("Error refreshing dashboard cache:", expect.any(Error));
  });

  it("returns success:false and touches no cache when the cacheRefresh rate limit is exceeded", async () => {
    mockEnforceRateLimit.mockImplementation(() => {
      throw new Error("Rate limit exceeded");
    });

    const result = await refreshDashboardCache();

    expect(result.success).toBe(false);
    expect(result.timestamp.getTime()).toBe(Date.now());
    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1", "cacheRefresh");
    expect(mockDeleteByPrefix).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("returns success:false and skips updateTag when the serviceCache purge throws", async () => {
    mockDeleteByPrefix.mockImplementation(() => {
      throw new Error("purge failed");
    });

    const result = await refreshDashboardCache();

    expect(result.success).toBe(false);
    expect(result.timestamp.getTime()).toBe(Date.now());
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  it("returns success:false when updateTag throws (e.g. called outside a server action)", async () => {
    mockUpdateTag.mockImplementation(() => {
      throw new Error("updateTag can only be called from within a Server Action");
    });

    const result = await refreshDashboardCache();

    expect(result.success).toBe(false);
    expect(result.timestamp.getTime()).toBe(Date.now());
    // The purge already ran: serviceCache is cold even though the tag expiry failed.
    expect(mockDeleteByPrefix).toHaveBeenCalledTimes(2);
  });

  it("does not read dashboard data itself (the client re-fetches after refresh)", async () => {
    await refreshDashboardCache();
    expect(mockGetCachedDashboardData).not.toHaveBeenCalled();
    expect(mockGetCachedFullRangeData).not.toHaveBeenCalled();
    expect(mockGetCachedExtendedData).not.toHaveBeenCalled();
    expect(mockGetCachedEngagementData).not.toHaveBeenCalled();
  });
});
