import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const {
  mockRequireFeatureAccess,
  mockEnforceRateLimit,
  mockMarkForRefresh,
  mockDeleteByPrefix,
  mockUpdateTag,
  mockRevalidatePath,
  mockRevalidateTag,
  mockGetCachedFullRangeData,
  mockGetCachedExtendedData,
  mockGetCachedEngagementData,
  mockLoadFullRangeData,
  mockLoadExtendedData,
  mockLoadEngagementData,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockMarkForRefresh: vi.fn(),
  mockDeleteByPrefix: vi.fn(),
  mockUpdateTag: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockGetCachedFullRangeData: vi.fn(),
  mockGetCachedExtendedData: vi.fn(),
  mockGetCachedEngagementData: vi.fn(),
  mockLoadFullRangeData: vi.fn(),
  mockLoadExtendedData: vi.fn(),
  mockLoadEngagementData: vi.fn(),
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
  serviceCache: { markForRefresh: mockMarkForRefresh, deleteByPrefix: mockDeleteByPrefix, getOrFetch: vi.fn() },
  CACHE_TTL: { STANDARD: 1, LONG: 2 },
}));
vi.mock("@/components/dashboard/cached-data", () => ({
  getCachedFullRangeData: mockGetCachedFullRangeData,
  getCachedExtendedData: mockGetCachedExtendedData,
  getCachedEngagementData: mockGetCachedEngagementData,
  loadFullRangeData: mockLoadFullRangeData,
  loadExtendedData: mockLoadExtendedData,
  loadEngagementData: mockLoadEngagementData,
}));

import {
  getFullRangeDashboardMetrics,
  getExtendedDashboardMetrics,
  getEngagementDashboardMetrics,
  refreshDashboardCache,
} from "@/components/dashboard/actions";

const SESSION = { user: { id: "user-1" } };
const DATA = { marker: "dashboard-data" };
const CORE = { marker: "fresh-core" };
const EXTENDED = { marker: "fresh-extended" };
const ENGAGEMENT = { marker: "fresh-engagement" };
const SECTION_TAGS = ["dashboard-full-range", "dashboard-extended", "dashboard-engagement"];

/** updateTag calls naming a section tag. */
const sectionTagCalls = () => mockUpdateTag.mock.calls.map((c) => c[0]).filter((t) => SECTION_TAGS.includes(t));

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
  mockMarkForRefresh.mockImplementation(() => {});
  mockUpdateTag.mockImplementation(() => {});
  mockGetCachedFullRangeData.mockResolvedValue(DATA);
  mockGetCachedExtendedData.mockResolvedValue(DATA);
  mockGetCachedEngagementData.mockResolvedValue(DATA);
  mockLoadFullRangeData.mockResolvedValue(CORE);
  mockLoadExtendedData.mockResolvedValue(EXTENDED);
  mockLoadEngagementData.mockResolvedValue(ENGAGEMENT);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  vi.useRealTimers();
  vi.restoreAllMocks();
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

  // The ministry year follows the SERVER's local calendar, not UTC and not Central
  // (dashboard-range.test.ts covers the rollover itself).
  it("reads the ministry year in server-local time: still August in Chicago when UTC is already September", async () => {
    setServerTimeZone("America/Chicago");
    vi.setSystemTime(new Date("2026-09-01T03:00:00Z")); // Aug 31 22:00 CDT
    await getFullRangeDashboardMetrics();
    expect(mockGetCachedFullRangeData).toHaveBeenLastCalledWith(2021, "2026-08-31");
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
  it("authorizes, rate-limits, marks serviceCache, reloads every section and returns the fresh data", async () => {
    const result = await refreshDashboardCache();

    expect(result).toEqual({
      success: true,
      refused: false,
      timestamp: new Date(Date.now()),
      core: CORE,
      extended: EXTENDED,
      engagement: ENGAGEMENT,
    });

    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("dashboard");
    expect(mockEnforceRateLimit).toHaveBeenCalledTimes(1);
    expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1", "cacheRefresh");
    expect(mockMarkForRefresh.mock.calls).toEqual([["dashboard"], ["group-types"]]);

    // The same stable keys the read actions use (17 Nov 2026 -> ministry year 2026).
    expect(mockLoadFullRangeData).toHaveBeenCalledWith(2022, "2027-08-31");
    expect(mockLoadExtendedData).toHaveBeenCalledWith("2022-09-01", "2027-08-31");
    expect(mockLoadEngagementData).toHaveBeenCalledWith("2022-09-01", "2027-08-31");

    expect(mockUpdateTag.mock.calls).toEqual([
      ["group-types"],
      ["dashboard-full-range"],
      ["dashboard-extended"],
      ["dashboard-engagement"],
    ]);
  });

  // updateTag makes Next re-render /dashboard into the action's response. Had a
  // section tag been expired before its load settled, that render would have run
  // the forced MP fetch itself, and an MP failure would have thrown into the
  // dashboard's error boundary, replacing the whole page.
  it("expires no section tag until every load has settled", async () => {
    let releaseCore!: (v: unknown) => void;
    mockLoadFullRangeData.mockReturnValue(new Promise((resolve) => (releaseCore = resolve)));

    const pending = refreshDashboardCache();
    await vi.waitFor(() => expect(mockLoadEngagementData).toHaveBeenCalled());
    await Promise.resolve();
    expect(sectionTagCalls()).toEqual([]);

    releaseCore(CORE);
    await pending;
    expect(sectionTagCalls()).toEqual(SECTION_TAGS);
  });

  it("marks serviceCache, then expires group-types, BEFORE any section loads", async () => {
    await refreshDashboardCache();

    const authOrder = mockRequireFeatureAccess.mock.invocationCallOrder[0];
    const rateOrder = mockEnforceRateLimit.mock.invocationCallOrder[0];
    const markOrders = mockMarkForRefresh.mock.invocationCallOrder;
    const groupTypesTag = mockUpdateTag.mock.invocationCallOrder[mockUpdateTag.mock.calls.findIndex((c) => c[0] === "group-types")];
    const firstLoad = Math.min(
      mockLoadFullRangeData.mock.invocationCallOrder[0],
      mockLoadExtendedData.mock.invocationCallOrder[0],
      mockLoadEngagementData.mock.invocationCallOrder[0],
    );

    expect(authOrder).toBeLessThan(rateOrder);
    expect(rateOrder).toBeLessThan(Math.min(...markOrders));
    // Marked first: an unmarked load returns its own cached serviceCache value.
    expect(Math.max(...markOrders)).toBeLessThan(groupTypesTag);
    // group-types expired before the loads, so their Group_Types lookups re-run
    // getCachedGroupTypes' body and take its marked serviceCache entry.
    expect(groupTypesTag).toBeLessThan(firstLoad);
  });

  it.each([
    ["core", mockLoadFullRangeData, "dashboard-full-range"],
    ["extended", mockLoadExtendedData, "dashboard-extended"],
    ["engagement", mockLoadEngagementData, "dashboard-engagement"],
  ] as const)("leaves the %s tag alone and omits its data when its MP reload fails, and still applies the others", async (name, load, tag) => {
    load.mockRejectedValue(new Error("MP down"));

    const result = await refreshDashboardCache();

    expect(result.success).toBe(false);
    expect(result.refused).toBe(false);
    expect(result).not.toHaveProperty(name);
    expect(sectionTagCalls()).toEqual(SECTION_TAGS.filter((t) => t !== tag));
    expect(Object.keys(result).filter((k) => ["core", "extended", "engagement"].includes(k))).toHaveLength(2);
  });

  it("expires no section tag when every reload fails, and is not reported as refused", async () => {
    mockLoadFullRangeData.mockRejectedValue(new Error("down"));
    mockLoadExtendedData.mockRejectedValue(new Error("down"));
    mockLoadEngagementData.mockRejectedValue(new Error("down"));

    const result = await refreshDashboardCache();

    expect(result).toEqual({ success: false, refused: false, timestamp: new Date(Date.now()) });
    expect(sectionTagCalls()).toEqual([]);
  });

  it("returns a reloaded section but success:false when its tag cannot be expired", async () => {
    mockUpdateTag.mockImplementation((tag: string) => {
      if (tag === "dashboard-extended") throw new Error("handler down");
    });

    const result = await refreshDashboardCache();

    expect(result.success).toBe(false);
    expect(result.extended).toBe(EXTENDED);
    expect(result.core).toBe(CORE);
    expect(console.error).toHaveBeenCalledWith("Error refreshing dashboard cache:", expect.any(Error));
  });

  // Was a bug: deleteByPrefix dropped the last good value before the re-fetch was
  // known to succeed, so one MP failure during Refresh left both cache layers
  // empty and every later page load paid a cold fetch. markForRefresh keeps it.
  it("marks serviceCache for refresh instead of deleting the last good values", async () => {
    await refreshDashboardCache();
    expect(mockDeleteByPrefix).not.toHaveBeenCalled();
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

  it("reloads through the serviceCache layer, never the 'use cache' layer", async () => {
    await refreshDashboardCache();
    expect(mockGetCachedFullRangeData).not.toHaveBeenCalled();
    expect(mockGetCachedExtendedData).not.toHaveBeenCalled();
    expect(mockGetCachedEngagementData).not.toHaveBeenCalled();
  });

  it("marks prefixes that cover every serviceCache key the tagged caches use", async () => {
    await refreshDashboardCache();
    const purged = mockMarkForRefresh.mock.calls.map((c) => c[0] as string);

    // Every serviceCache.getOrFetch() call in the cached sources must have a key
    // we can resolve to a literal prefix: an inline string/template literal, or
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
          // The nearest binding of that name before this call (each loader
          // declares its own `const key`).
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

    // full range, extended, engagement, group types
    expect(keyPrefixes.length).toBeGreaterThanOrEqual(4);
    for (const prefix of keyPrefixes) {
      expect(purged.some((p) => prefix.startsWith(p)), `key prefix "${prefix}" not marked`).toBe(true);
    }
  });

  it.each([
    ["authorization fails", () => mockRequireFeatureAccess.mockRejectedValue(new Error("Forbidden"))],
    ["the cacheRefresh rate limit is exceeded", () => mockEnforceRateLimit.mockImplementation(() => { throw new Error("Rate limit exceeded"); })],
    ["the serviceCache mark throws", () => mockMarkForRefresh.mockImplementation(() => { throw new Error("mark failed"); })],
    ["updateTag throws (e.g. called outside a server action)", () => mockUpdateTag.mockImplementation(() => { throw new Error("updateTag can only be called from within a Server Action"); })],
  ])("is refused, and reads nothing from MP, when %s", async (_label, arrange) => {
    arrange();

    const result = await refreshDashboardCache();

    // The failure timestamp is "now" too, not a sentinel such as the epoch.
    expect(result).toEqual({ success: false, refused: true, timestamp: new Date(Date.now()) });
    expect(mockLoadFullRangeData).not.toHaveBeenCalled();
    expect(mockLoadExtendedData).not.toHaveBeenCalled();
    expect(mockLoadEngagementData).not.toHaveBeenCalled();
    expect(sectionTagCalls()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith("Error refreshing dashboard cache:", expect.any(Error));
  });

  it("does not rate-limit or mark anything when authorization fails", async () => {
    mockRequireFeatureAccess.mockRejectedValue(new Error("Forbidden"));
    await refreshDashboardCache();
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
    expect(mockMarkForRefresh).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });
});
