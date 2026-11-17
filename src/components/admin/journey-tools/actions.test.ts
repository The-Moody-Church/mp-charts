import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JourneyToolConfig, JourneyToolsConfig } from "@/lib/journey-tools-config";
import type { FeatureAccessConfig } from "@/lib/authorization";

const {
  mockRequireFeatureAccess,
  mockLoadFeatureAccess,
  mockSaveFeatureAccess,
  mockGetTableRecords,
  mockLoadJourneyToolsConfig,
  mockSaveJourneyToolsConfig,
  mockClearCache,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockLoadFeatureAccess: vi.fn(),
  mockSaveFeatureAccess: vi.fn(),
  mockGetTableRecords: vi.fn(),
  mockLoadJourneyToolsConfig: vi.fn(),
  mockSaveJourneyToolsConfig: vi.fn(),
  mockClearCache: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  requireFeatureAccess: mockRequireFeatureAccess,
  loadFeatureAccess: mockLoadFeatureAccess,
  saveFeatureAccess: mockSaveFeatureAccess,
}));

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
  },
}));

// Config I/O is mocked (no filesystem); the real Zod validator from the
// fs-free types module is kept so validation behaviour is genuinely exercised.
vi.mock("@/lib/journey-tools-config", async () => {
  const types = await vi.importActual<typeof import("@/lib/journey-tools-config-types")>(
    "@/lib/journey-tools-config-types"
  );
  return {
    ...types,
    loadJourneyToolsConfig: mockLoadJourneyToolsConfig,
    saveJourneyToolsConfig: mockSaveJourneyToolsConfig,
  };
});

vi.mock("@/services/journeyProcessingService", () => ({
  JourneyProcessingService: { clearCache: mockClearCache },
}));

import {
  getAvailableJourneys,
  getJourneyMilestones,
  getAvailablePrograms,
  getAvailableGroups,
  getAvailableGroupRoles,
  getActiveMinistries,
  getProgramsByIds,
  getGroupsByIds,
  resolveToolNames,
  getJourneyToolsConfigAction,
  saveJourneyToolAction,
  deleteJourneyToolAction,
} from "@/components/admin/journey-tools/actions";

const FORBIDDEN = new Error("Forbidden: insufficient permissions");

function makeTool(overrides: Partial<JourneyToolConfig> = {}): JourneyToolConfig {
  return {
    slug: "new-members",
    journeyId: 7,
    journeyName: "New Members",
    description: "Membership journey",
    enabled: true,
    milestones: [{ milestoneId: 11, label: "Class", sortOrder: 0, visible: true }],
    programId: 3,
    trackingGroupId: 40,
    pausedGroupId: null,
    defaultGroupRoleId: 2,
    supportsPause: false,
    pauseMilestoneId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let storedConfig: JourneyToolsConfig;
let featureAccess: FeatureAccessConfig;

beforeEach(() => {
  // mockReset (not just clear): some tests install throwing implementations.
  for (const m of [
    mockRequireFeatureAccess,
    mockLoadFeatureAccess,
    mockSaveFeatureAccess,
    mockGetTableRecords,
    mockLoadJourneyToolsConfig,
    mockSaveJourneyToolsConfig,
    mockClearCache,
  ]) {
    m.mockReset();
  }
  mockRequireFeatureAccess.mockResolvedValue({ user: { id: "u1" } });
  mockGetTableRecords.mockResolvedValue([]);
  storedConfig = { journeys: [] };
  featureAccess = {};
  mockLoadJourneyToolsConfig.mockImplementation(() => storedConfig);
  mockLoadFeatureAccess.mockImplementation(() => featureAccess);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// Authorization gate — every action requires "admin"
// ---------------------------------------------------------------------------

describe("admin gate", () => {
  const readers: Array<[string, () => Promise<unknown>]> = [
    ["getAvailableJourneys", () => getAvailableJourneys()],
    ["getJourneyMilestones", () => getJourneyMilestones(7)],
    ["getAvailablePrograms", () => getAvailablePrograms("x")],
    ["getAvailableGroups", () => getAvailableGroups("x")],
    ["getAvailableGroupRoles", () => getAvailableGroupRoles()],
    ["getActiveMinistries", () => getActiveMinistries()],
    ["getProgramsByIds", () => getProgramsByIds([1])],
    ["getGroupsByIds", () => getGroupsByIds([1])],
    ["resolveToolNames", () => resolveToolNames([1], [2])],
    ["getJourneyToolsConfigAction", () => getJourneyToolsConfigAction()],
  ];

  it.each(readers)("%s checks the admin feature and rejects a denied caller with no MP/config read", async (_name, call) => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);
    await expect(call()).rejects.toThrow("Forbidden");
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
    expect(mockGetTableRecords).not.toHaveBeenCalled();
    expect(mockLoadJourneyToolsConfig).not.toHaveBeenCalled();
  });

  it("saveJourneyToolAction: denied caller gets an error result and nothing is written", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);
    await expect(saveJourneyToolAction(makeTool(), true)).resolves.toEqual({
      success: false,
      error: "Forbidden: insufficient permissions",
    });
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
    expect(mockLoadJourneyToolsConfig).not.toHaveBeenCalled();
    expect(mockSaveJourneyToolsConfig).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("saveJourneyToolAction: authorization runs before validation (invalid payload from a denied caller still reports Forbidden)", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);
    const result = await saveJourneyToolAction(makeTool({ slug: "BAD SLUG" }));
    expect(result.error).toBe("Forbidden: insufficient permissions");
  });

  it("deleteJourneyToolAction: denied caller gets a static error and nothing is written", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);
    await expect(deleteJourneyToolAction("new-members")).resolves.toEqual({
      success: false,
      error: "Failed to delete journey tool",
    });
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
    expect(mockSaveJourneyToolsConfig).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// MP data queries
// ---------------------------------------------------------------------------

describe("getAvailableJourneys", () => {
  it("queries active (or null-active) journeys ordered by name", async () => {
    const rows = [{ Journey_ID: 1, Journey_Name: "A", Description: null, Active: true }];
    mockGetTableRecords.mockResolvedValue(rows);
    await expect(getAvailableJourneys()).resolves.toBe(rows);
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: "Journeys",
      select: "Journey_ID,Journey_Name,Description,Active",
      filter: "Active = 1 OR Active IS NULL",
      orderBy: "Journey_Name",
    });
  });

  it("propagates MP errors", async () => {
    mockGetTableRecords.mockRejectedValue(new Error("MP down"));
    await expect(getAvailableJourneys()).rejects.toThrow("MP down");
  });
});

describe("getJourneyMilestones", () => {
  it("filters milestones by the sanitized journey ID and excludes discontinued ones", async () => {
    await getJourneyMilestones(7);
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: "Milestones",
      select: "Milestone_ID,Milestone_Title,Sort_Order,Discontinued",
      filter: "Journey_ID = 7 AND (Discontinued = 0 OR Discontinued IS NULL)",
      orderBy: "Sort_Order",
    });
  });

  it("accepts a numeric string (type-erased Flight arg) and interpolates the parsed number", async () => {
    await getJourneyMilestones("12" as unknown as number);
    expect(mockGetTableRecords.mock.calls[0][0].filter).toBe(
      "Journey_ID = 12 AND (Discontinued = 0 OR Discontinued IS NULL)"
    );
  });

  it.each([
    ["injection string", "1 OR 1=1"],
    ["float", 1.5],
    ["zero", 0],
    ["negative", -3],
    ["NaN", NaN],
  ])("rejects a %s ID without querying MP", async (_label, value) => {
    await expect(getJourneyMilestones(value as unknown as number)).rejects.toThrow("Invalid ID");
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it("checks authorization before validating the ID", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);
    await expect(getJourneyMilestones("1 OR 1=1" as unknown as number)).rejects.toThrow("Forbidden");
  });
});

describe.each([
  ["getAvailablePrograms", getAvailablePrograms, "Programs", "Program_ID,Program_Name", "Program_Name"],
  ["getAvailableGroups", getAvailableGroups, "Groups", "Group_ID,Group_Name", "Group_Name"],
] as const)("%s", (_name, action, table, select, nameCol) => {
  it("without a search, returns active records capped at 50", async () => {
    await action();
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table,
      select,
      filter: "End_Date IS NULL",
      orderBy: nameCol,
      top: 50,
    });
  });

  it("ignores a whitespace-only search", async () => {
    await action("   ");
    expect(mockGetTableRecords.mock.calls[0][0].filter).toBe("End_Date IS NULL");
  });

  it("adds a LIKE clause for a search term", async () => {
    await action("youth");
    expect(mockGetTableRecords.mock.calls[0][0].filter).toBe(`End_Date IS NULL AND ${nameCol} LIKE '%youth%'`);
  });

  it("escapes quotes and neutralizes LIKE wildcards in the search term", async () => {
    await action("O'Brien 100%_[x]");
    expect(mockGetTableRecords.mock.calls[0][0].filter).toBe(
      `End_Date IS NULL AND ${nameCol} LIKE '%O''Brien 100[%][_][[]x]%'`
    );
  });

  it("a quote-based injection attempt stays inside the string literal", async () => {
    await action("' OR 1=1 --");
    expect(mockGetTableRecords.mock.calls[0][0].filter).toBe(
      `End_Date IS NULL AND ${nameCol} LIKE '%'' OR 1=1 --%'`
    );
  });
});

describe("getAvailableGroupRoles", () => {
  it("queries all group roles ordered by title (no filter)", async () => {
    await getAvailableGroupRoles();
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: "Group_Roles",
      select: "Group_Role_ID,Role_Title,Ministry_ID",
      orderBy: "Role_Title",
    });
  });
});

describe("getActiveMinistries", () => {
  it("queries non-ended ministries ordered by name", async () => {
    await getActiveMinistries();
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: "Ministries",
      select: "Ministry_ID,Ministry_Name",
      filter: "End_Date IS NULL",
      orderBy: "Ministry_Name",
    });
  });
});

describe.each([
  ["getProgramsByIds", getProgramsByIds, "Programs", "Program_ID,Program_Name", "Program_ID"],
  ["getGroupsByIds", getGroupsByIds, "Groups", "Group_ID,Group_Name", "Group_ID"],
] as const)("%s", (_name, action, table, select, idCol) => {
  it("returns [] for an empty list without querying MP", async () => {
    await expect(action([])).resolves.toEqual([]);
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it("builds an IN clause from sanitized IDs", async () => {
    await action([5, 9]);
    expect(mockGetTableRecords).toHaveBeenCalledWith({ table, select, filter: `${idCol} IN (5,9)` });
  });

  it("drops non-numeric / non-positive IDs before interpolation (sanitizeIds)", async () => {
    await action([5, "1) OR (1=1" as unknown as number, -1, 0, NaN, 9]);
    expect(mockGetTableRecords.mock.calls[0][0].filter).toBe(`${idCol} IN (5,9)`);
  });

  it("throws without querying MP when no ID is valid", async () => {
    await expect(action(["1 OR 1=1" as unknown as number])).rejects.toThrow("sanitizeIds: no valid IDs provided");
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it("requires admin for a non-empty list", async () => {
    await action([1]);
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
  });

  // NOTE: the empty-list short-circuit runs BEFORE requireFeatureAccess, so an
  // unauthenticated caller gets [] back. No data is exposed, but the gate is
  // skipped. Pinned here as current behaviour.
  it("current behaviour: the empty-list early return skips the admin check", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);
    await expect(action([])).resolves.toEqual([]);
    expect(mockRequireFeatureAccess).not.toHaveBeenCalled();
  });
});

describe("resolveToolNames", () => {
  it("returns empty maps and makes no MP calls when both lists are empty or all falsy", async () => {
    await expect(resolveToolNames([0, 0], [])).resolves.toEqual({ programs: {}, groups: {} });
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it("dedupes, drops falsy IDs, sanitizes, and maps names by ID", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Programs") {
        return Promise.resolve([
          { Program_ID: 3, Program_Name: "Adults" },
          { Program_ID: 4, Program_Name: "Youth" },
        ]);
      }
      if (params.table === "Groups") return Promise.resolve([{ Group_ID: 40, Group_Name: "Tracking" }]);
      return Promise.resolve([]);
    });

    const result = await resolveToolNames([3, 3, 0, 4], [40, 40]);

    expect(result).toEqual({ programs: { 3: "Adults", 4: "Youth" }, groups: { 40: "Tracking" } });
    expect(mockGetTableRecords).toHaveBeenCalledTimes(2);
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: "Programs",
      select: "Program_ID,Program_Name",
      filter: "Program_ID IN (3,4)",
    });
    expect(mockGetTableRecords).toHaveBeenCalledWith({
      table: "Groups",
      select: "Group_ID,Group_Name",
      filter: "Group_ID IN (40)",
    });
  });

  it("only queries the side that has IDs", async () => {
    mockGetTableRecords.mockResolvedValue([{ Group_ID: 8, Group_Name: "G" }]);
    await expect(resolveToolNames([], [8])).resolves.toEqual({ programs: {}, groups: { 8: "G" } });
    expect(mockGetTableRecords).toHaveBeenCalledTimes(1);
    expect(mockGetTableRecords.mock.calls[0][0].table).toBe("Groups");
  });

  it("injection strings in the ID lists never reach the filter", async () => {
    await resolveToolNames([2, "2) OR (1=1" as unknown as number], [5]);
    const programCall = mockGetTableRecords.mock.calls.find((c) => c[0].table === "Programs");
    expect(programCall?.[0].filter).toBe("Program_ID IN (2)");
  });

  it("propagates an MP failure on either query", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) =>
      params.table === "Groups" ? Promise.reject(new Error("timeout")) : Promise.resolve([])
    );
    await expect(resolveToolNames([1], [2])).rejects.toThrow("timeout");
  });
});

// ---------------------------------------------------------------------------
// Config CRUD
// ---------------------------------------------------------------------------

describe("getJourneyToolsConfigAction", () => {
  it("returns the loaded config after the admin check", async () => {
    storedConfig = { journeys: [makeTool()] };
    await expect(getJourneyToolsConfigAction()).resolves.toEqual({ journeys: [makeTool()] });
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
  });
});

describe("saveJourneyToolAction", () => {
  it("creates a new tool: appends, saves, registers feature access, clears the service cache", async () => {
    const tool = makeTool();
    await expect(saveJourneyToolAction(tool, true)).resolves.toEqual({ success: true });

    expect(mockSaveJourneyToolsConfig).toHaveBeenCalledTimes(1);
    expect(mockSaveJourneyToolsConfig.mock.calls[0][0]).toEqual({ journeys: [tool] });

    expect(mockSaveFeatureAccess).toHaveBeenCalledTimes(1);
    expect(mockSaveFeatureAccess.mock.calls[0][0]).toEqual({
      "journey:new-members": {
        label: "New Members",
        description: "Membership journey",
        allowedGroupIds: [],
      },
    });

    expect(mockClearCache).toHaveBeenCalledWith("new-members");
  });

  it("rejects a duplicate slug when isNew is true, with a field-prefixed error and no writes", async () => {
    storedConfig = { journeys: [makeTool({ journeyName: "Original" })] };
    await expect(saveJourneyToolAction(makeTool({ journeyName: "Copy" }), true)).resolves.toEqual({
      success: false,
      error: "slug: A tool with this slug already exists.",
    });
    expect(mockSaveJourneyToolsConfig).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
    expect(storedConfig.journeys[0].journeyName).toBe("Original");
  });

  it("updates an existing tool in place when isNew is not set", async () => {
    const other = makeTool({ slug: "baptism", journeyName: "Baptism" });
    storedConfig = { journeys: [makeTool({ journeyName: "Old" }), other] };
    const updated = makeTool({ journeyName: "Renamed", programId: 99 });

    await expect(saveJourneyToolAction(updated)).resolves.toEqual({ success: true });

    const saved = mockSaveJourneyToolsConfig.mock.calls[0][0] as JourneyToolsConfig;
    expect(saved.journeys).toHaveLength(2);
    expect(saved.journeys[0]).toEqual(updated);
    expect(saved.journeys[1]).toBe(other);
    expect(mockClearCache).toHaveBeenCalledWith("new-members");
  });

  it("with isNew false and an unknown slug, appends (upsert)", async () => {
    storedConfig = { journeys: [makeTool({ slug: "baptism" })] };
    await saveJourneyToolAction(makeTool(), false);
    const saved = mockSaveJourneyToolsConfig.mock.calls[0][0] as JourneyToolsConfig;
    expect(saved.journeys.map((j) => j.slug)).toEqual(["baptism", "new-members"]);
  });

  it("does not overwrite an existing feature-access entry (keeps admin-assigned groups)", async () => {
    featureAccess = {
      "journey:new-members": { label: "Old label", description: "d", allowedGroupIds: [5, 6] },
    };
    await expect(saveJourneyToolAction(makeTool())).resolves.toEqual({ success: true });
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(featureAccess["journey:new-members"].allowedGroupIds).toEqual([5, 6]);
  });

  it("does not register feature access for a disabled tool", async () => {
    await expect(saveJourneyToolAction(makeTool({ enabled: false }), true)).resolves.toEqual({ success: true });
    expect(mockLoadFeatureAccess).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockSaveJourneyToolsConfig).toHaveBeenCalledTimes(1);
    expect(mockClearCache).toHaveBeenCalledWith("new-members");
  });

  it("formats a Zod failure as 'field: message' and writes nothing", async () => {
    const result = await saveJourneyToolAction(makeTool({ slug: "Bad Slug" }), true);
    expect(result).toEqual({
      success: false,
      error: "slug: Slug must be lowercase alphanumeric with hyphens",
    });
    expect(mockLoadJourneyToolsConfig).not.toHaveBeenCalled();
    expect(mockSaveJourneyToolsConfig).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("joins multiple issues with '; ' and uses dotted paths for nested fields", async () => {
    const result = await saveJourneyToolAction(
      makeTool({
        journeyId: -1,
        journeyName: "",
        milestones: [{ milestoneId: 0, label: "x", sortOrder: 0, visible: true }],
      })
    );
    expect(result.success).toBe(false);
    const parts = result.error!.split("; ");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^journeyId: /);
    expect(parts[1]).toMatch(/^journeyName: /);
    expect(parts[2]).toMatch(/^milestones\.0\.milestoneId: /);
  });

  it("labels a root-level issue (empty path) as 'config'", async () => {
    const result = await saveJourneyToolAction(null as unknown as JourneyToolConfig);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^config: /);
    expect(mockSaveJourneyToolsConfig).not.toHaveBeenCalled();
  });

  it("rejects a type-erased string ID (Zod is the runtime control, not the TS type)", async () => {
    const result = await saveJourneyToolAction(makeTool({ programId: "3 OR 1=1" as unknown as number }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^programId: /);
    expect(mockSaveJourneyToolsConfig).not.toHaveBeenCalled();
  });

  it("returns the error message when the config save throws, and skips later steps", async () => {
    mockSaveJourneyToolsConfig.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });
    await expect(saveJourneyToolAction(makeTool(), true)).resolves.toEqual({
      success: false,
      error: "EACCES: permission denied",
    });
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("returns a generic message for a non-Error throw", async () => {
    mockLoadJourneyToolsConfig.mockImplementation(() => {
      throw "boom";
    });
    await expect(saveJourneyToolAction(makeTool())).resolves.toEqual({
      success: false,
      error: "Failed to save journey tool",
    });
  });

  // BUG (reported): the action validates with Zod but discards the parsed
  // (key-stripped) result and persists the caller's raw object. Unknown keys a
  // caller adds to the payload are written to data/journey-tools.json.
  it("current behaviour: unknown keys on the payload are persisted (parsed output is discarded)", async () => {
    const smuggled = { ...makeTool(), injected: "<script>" } as unknown as JourneyToolConfig;
    await expect(saveJourneyToolAction(smuggled, true)).resolves.toEqual({ success: true });
    const saved = mockSaveJourneyToolsConfig.mock.calls[0][0] as JourneyToolsConfig;
    expect(saved.journeys[0]).toHaveProperty("injected", "<script>");
  });
});

describe("deleteJourneyToolAction", () => {
  it("removes the tool, its feature-access entry, and clears the service cache", async () => {
    const keep = makeTool({ slug: "baptism" });
    storedConfig = { journeys: [makeTool(), keep] };
    featureAccess = {
      "journey:new-members": { label: "New Members", description: "", allowedGroupIds: [5] },
      "journey:baptism": { label: "Baptism", description: "", allowedGroupIds: [] },
    };

    await expect(deleteJourneyToolAction("new-members")).resolves.toEqual({ success: true });

    expect(mockSaveJourneyToolsConfig.mock.calls[0][0]).toEqual({ journeys: [keep] });
    expect(mockSaveFeatureAccess).toHaveBeenCalledTimes(1);
    expect(mockSaveFeatureAccess.mock.calls[0][0]).toEqual({
      "journey:baptism": { label: "Baptism", description: "", allowedGroupIds: [] },
    });
    expect(mockClearCache).toHaveBeenCalledWith("new-members");
  });

  it("does not rewrite feature access when no entry exists for the slug", async () => {
    storedConfig = { journeys: [makeTool()] };
    featureAccess = { "journey:baptism": { label: "B", description: "", allowedGroupIds: [] } };
    await expect(deleteJourneyToolAction("new-members")).resolves.toEqual({ success: true });
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockSaveJourneyToolsConfig.mock.calls[0][0]).toEqual({ journeys: [] });
  });

  it("only touches the journey:<slug> key, never a same-named compliance key", async () => {
    featureAccess = {
      "journey:x": { label: "J", description: "", allowedGroupIds: [] },
      "compliance:x": { label: "C", description: "", allowedGroupIds: [] },
    };
    await deleteJourneyToolAction("x");
    expect(Object.keys(mockSaveFeatureAccess.mock.calls[0][0])).toEqual(["compliance:x"]);
  });

  it("returns a static error message (never echoing the error) when a write fails", async () => {
    mockSaveJourneyToolsConfig.mockImplementation(() => {
      throw new Error("EACCES: /app/data/journey-tools.json");
    });
    await expect(deleteJourneyToolAction("new-members")).resolves.toEqual({
      success: false,
      error: "Failed to delete journey tool",
    });
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });
});
