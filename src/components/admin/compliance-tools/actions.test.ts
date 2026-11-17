import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ComplianceToolConfig, ComplianceToolsConfig } from "@/lib/compliance-tools-config-types";
import type { FeatureAccessConfig } from "@/lib/authorization";

const {
  mockRequireFeatureAccess,
  mockLoadFeatureAccess,
  mockSaveFeatureAccess,
  mockGetTableRecords,
  mockLoadConfig,
  mockSaveConfig,
  mockClearCache,
  mockEnforceRateLimit,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockLoadFeatureAccess: vi.fn(),
  mockSaveFeatureAccess: vi.fn(),
  mockGetTableRecords: vi.fn(),
  mockLoadConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
  mockClearCache: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
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

// Config I/O is mocked (no filesystem); validation is the REAL Zod schema so the
// "field: message; ..." formatting is exercised against genuine ZodError issues.
vi.mock("@/lib/compliance-tools-config", async () => {
  const types = await vi.importActual<typeof import("@/lib/compliance-tools-config-types")>(
    "@/lib/compliance-tools-config-types",
  );
  return {
    validateComplianceToolConfig: types.validateComplianceToolConfig,
    loadComplianceToolsConfig: mockLoadConfig,
    saveComplianceToolsConfig: mockSaveConfig,
  };
});

vi.mock("@/services/complianceProcessingService", () => ({
  ComplianceProcessingService: { clearCache: mockClearCache },
}));

// Not imported by the source today; mocked so the tests can pin that the write
// tier is NOT applied (see the "rate limiting" describe block).
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mockEnforceRateLimit }));

import {
  getDeduplicatedRequirements,
  getComplianceToolsConfigAction,
  saveComplianceToolAction,
  deleteComplianceToolAction,
} from "./actions";

const FORBIDDEN = new Error("Forbidden: insufficient permissions");

function makeTool(overrides: Partial<ComplianceToolConfig> = {}): ComplianceToolConfig {
  return {
    slug: "kids-volunteers",
    toolName: "Kids Volunteers",
    description: "Compliance for kids ministry volunteers",
    enabled: true,
    groupRoleIds: [16],
    journeyId: null,
    journeyMilestones: [],
    requirements: [],
    programId: null,
    trackingGroupId: null,
    defaultGroupRoleId: 2,
    supportsPause: false,
    pausedGroupId: null,
    pauseMilestoneId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

/** Dispatch MP reads by table (the action fires them in parallel). */
function mpTables(tables: Record<string, unknown[]>) {
  mockGetTableRecords.mockImplementation((params: { table: string }) =>
    Promise.resolve(tables[params.table] ?? []),
  );
}

function callFor(table: string) {
  const call = mockGetTableRecords.mock.calls.find(([p]) => p.table === table);
  return call?.[0] as { table: string; select: string; filter: string } | undefined;
}

let config: ComplianceToolsConfig;
let featureAccess: FeatureAccessConfig;

beforeEach(() => {
  // Reset (not just clear): several tests install throwing implementations.
  vi.resetAllMocks();
  mockRequireFeatureAccess.mockResolvedValue({ user: { id: "u1" } });
  config = { tools: [] };
  featureAccess = { admin: { label: "Admin", description: "", allowedGroupIds: [] } };
  mockLoadConfig.mockImplementation(() => config);
  mockLoadFeatureAccess.mockImplementation(() => featureAccess);
  mpTables({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// ---------------------------------------------------------------------------
// getDeduplicatedRequirements
// ---------------------------------------------------------------------------

describe("getDeduplicatedRequirements", () => {
  it("requires admin access and makes no MP call when denied", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);
    await expect(getDeduplicatedRequirements([16])).rejects.toThrow("Forbidden");
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it("returns [] for no roles without querying MP (but still after the admin gate)", async () => {
    await expect(getDeduplicatedRequirements([])).resolves.toEqual([]);
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it("queries Participation_Requirements and Group_Roles with sanitized role IDs", async () => {
    await getDeduplicatedRequirements([16, 22]);

    expect(callFor("Participation_Requirements")).toEqual({
      table: "Participation_Requirements",
      select: "Background_Check_Type_ID,Certification_Type_ID,Milestone_ID,Custom_Form_ID",
      filter: "Group_Role_ID IN (16,22)",
    });
    expect(callFor("Group_Roles")).toEqual({
      table: "Group_Roles",
      select: "Group_Role_ID,Background_Check_Required",
      filter: "Group_Role_ID IN (16,22)",
    });
    // No requirements -> no name-resolution queries
    expect(mockGetTableRecords).toHaveBeenCalledTimes(2);
  });

  it("drops injected / invalid role IDs from the filter (sanitizeIds)", async () => {
    // Server-action args are type-erased: a "number[]" can carry strings.
    const ids = [16, "1 OR 1=1", -3, 0, NaN] as unknown as number[];
    await getDeduplicatedRequirements(ids);
    expect(callFor("Participation_Requirements")?.filter).toBe("Group_Role_ID IN (16)");
    expect(callFor("Group_Roles")?.filter).toBe("Group_Role_ID IN (16)");
  });

  it("rejects when every role ID is invalid, before any MP query is sent", async () => {
    const ids = ["1 OR 1=1", -1] as unknown as number[];
    await expect(getDeduplicatedRequirements(ids)).rejects.toThrow("sanitizeIds: no valid IDs provided");
    expect(mockGetTableRecords).not.toHaveBeenCalled();
  });

  it("deduplicates entities across roles, resolves names per type and sorts by label", async () => {
    mpTables({
      Participation_Requirements: [
        { Background_Check_Type_ID: null, Certification_Type_ID: 5, Milestone_ID: null, Custom_Form_ID: null },
        { Background_Check_Type_ID: null, Certification_Type_ID: 5, Milestone_ID: null, Custom_Form_ID: null },
        { Background_Check_Type_ID: null, Certification_Type_ID: null, Milestone_ID: 9, Custom_Form_ID: null },
        { Background_Check_Type_ID: null, Certification_Type_ID: null, Milestone_ID: null, Custom_Form_ID: 33 },
        { Background_Check_Type_ID: null, Certification_Type_ID: null, Milestone_ID: null, Custom_Form_ID: 33 },
        { Background_Check_Type_ID: 4, Certification_Type_ID: null, Milestone_ID: null, Custom_Form_ID: null },
      ],
      Group_Roles: [{ Group_Role_ID: 16, Background_Check_Required: false }],
      Background_Check_Types: [{ Background_Check_Type_ID: 4, Background_Check_Type: "Ministry Safe" }],
      Certification_Types: [{ Certification_Type_ID: 5, Certification_Type: "CPR" }],
      Milestones: [{ Milestone_ID: 9, Milestone_Title: "Orientation" }],
      Forms: [{ Form_ID: 33, Form_Title: "Code of Conduct" }],
    });

    const result = await getDeduplicatedRequirements([16, 22]);

    expect(result).toEqual([
      { requirementId: 33, label: "Code of Conduct", type: "form" },
      { requirementId: 5, label: "CPR", type: "certification" },
      { requirementId: 4, label: "Ministry Safe", type: "background_check" },
      { requirementId: 9, label: "Orientation", type: "milestone" },
    ]);

    // Each lookup is narrowed to the deduplicated IDs only.
    expect(callFor("Background_Check_Types")).toEqual({
      table: "Background_Check_Types",
      select: "Background_Check_Type_ID,Background_Check_Type",
      filter: "Background_Check_Type_ID IN (4)",
    });
    expect(callFor("Certification_Types")?.filter).toBe("Certification_Type_ID IN (5)");
    expect(callFor("Certification_Types")?.select).toBe("Certification_Type_ID,Certification_Type");
    expect(callFor("Milestones")?.filter).toBe("Milestone_ID IN (9)");
    expect(callFor("Milestones")?.select).toBe("Milestone_ID,Milestone_Title");
    expect(callFor("Forms")?.filter).toBe("Form_ID IN (33)");
    expect(callFor("Forms")?.select).toBe("Form_ID,Form_Title");
  });

  it("classifies a row by the first non-null link (background check > certification > milestone > form)", async () => {
    mpTables({
      Participation_Requirements: [
        { Background_Check_Type_ID: null, Certification_Type_ID: 7, Milestone_ID: 8, Custom_Form_ID: 9 },
      ],
      Certification_Types: [{ Certification_Type_ID: 7, Certification_Type: "First Aid" }],
    });

    const result = await getDeduplicatedRequirements([16]);

    expect(result).toEqual([{ requirementId: 7, label: "First Aid", type: "certification" }]);
    expect(callFor("Milestones")).toBeUndefined();
    expect(callFor("Forms")).toBeUndefined();
  });

  it("only queries the lookup tables that have IDs", async () => {
    mpTables({
      Participation_Requirements: [
        { Background_Check_Type_ID: null, Certification_Type_ID: null, Milestone_ID: 9, Custom_Form_ID: null },
      ],
      Milestones: [{ Milestone_ID: 9, Milestone_Title: "Orientation" }],
    });

    await getDeduplicatedRequirements([16]);

    const tables = mockGetTableRecords.mock.calls.map(([p]) => p.table).sort();
    expect(tables).toEqual(["Group_Roles", "Milestones", "Participation_Requirements"]);
  });

  it("adds a single generic Background Check (ID 0) when a role requires one but no specific type is linked", async () => {
    mpTables({
      Participation_Requirements: [],
      Group_Roles: [
        { Group_Role_ID: 16, Background_Check_Required: false },
        { Group_Role_ID: 22, Background_Check_Required: true },
        { Group_Role_ID: 23, Background_Check_Required: true },
      ],
    });

    await expect(getDeduplicatedRequirements([16, 22, 23])).resolves.toEqual([
      { requirementId: 0, label: "Background Check", type: "background_check" },
    ]);
    expect(callFor("Background_Check_Types")).toBeUndefined();
  });

  it("prefers specific background check types over the generic entry", async () => {
    mpTables({
      Participation_Requirements: [
        { Background_Check_Type_ID: 4, Certification_Type_ID: null, Milestone_ID: null, Custom_Form_ID: null },
      ],
      Group_Roles: [{ Group_Role_ID: 16, Background_Check_Required: true }],
      Background_Check_Types: [{ Background_Check_Type_ID: 4, Background_Check_Type: "Ministry Safe" }],
    });

    const result = await getDeduplicatedRequirements([16]);

    expect(result).toEqual([{ requirementId: 4, label: "Ministry Safe", type: "background_check" }]);
    expect(result.some((r) => r.requirementId === 0)).toBe(false);
  });

  it("falls back to the generic entry when linked background check types no longer resolve in MP", async () => {
    mpTables({
      Participation_Requirements: [
        { Background_Check_Type_ID: 4, Certification_Type_ID: null, Milestone_ID: null, Custom_Form_ID: null },
      ],
      Group_Roles: [{ Group_Role_ID: 16, Background_Check_Required: true }],
      Background_Check_Types: [],
    });

    await expect(getDeduplicatedRequirements([16])).resolves.toEqual([
      { requirementId: 0, label: "Background Check", type: "background_check" },
    ]);
  });

  it("returns no background check entry when no role requires one and none is linked", async () => {
    mpTables({
      Participation_Requirements: [],
      Group_Roles: [{ Group_Role_ID: 16, Background_Check_Required: false }],
    });
    await expect(getDeduplicatedRequirements([16])).resolves.toEqual([]);
  });

  it("propagates an MP failure from the first round of queries", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) =>
      params.table === "Group_Roles" ? Promise.reject(new Error("MP down")) : Promise.resolve([]),
    );
    await expect(getDeduplicatedRequirements([16])).rejects.toThrow("MP down");
  });

  it("propagates an MP failure from a name-resolution query", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Participation_Requirements") {
        return Promise.resolve([
          { Background_Check_Type_ID: null, Certification_Type_ID: 5, Milestone_ID: null, Custom_Form_ID: null },
        ]);
      }
      if (params.table === "Certification_Types") return Promise.reject(new Error("timeout"));
      return Promise.resolve([]);
    });
    await expect(getDeduplicatedRequirements([16])).rejects.toThrow("timeout");
  });
});

// ---------------------------------------------------------------------------
// getComplianceToolsConfigAction
// ---------------------------------------------------------------------------

describe("getComplianceToolsConfigAction", () => {
  it("returns the stored config to an admin", async () => {
    config = { tools: [makeTool()] };
    await expect(getComplianceToolsConfigAction()).resolves.toEqual(config);
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
  });

  it("rejects a non-admin without reading the config", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);
    await expect(getComplianceToolsConfigAction()).rejects.toThrow("Forbidden");
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// saveComplianceToolAction
// ---------------------------------------------------------------------------

describe("saveComplianceToolAction", () => {
  it("returns the auth error and performs no write for a non-admin", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);

    await expect(saveComplianceToolAction(makeTool(), true)).resolves.toEqual({
      success: false,
      error: "Forbidden: insufficient permissions",
    });
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
    expect(mockLoadConfig).not.toHaveBeenCalled();
    expect(mockSaveConfig).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("creates a new tool, registers its feature key and clears the service cache", async () => {
    config = { tools: [makeTool({ slug: "other" })] };
    const tool = makeTool();

    await expect(saveComplianceToolAction(tool, true)).resolves.toEqual({ success: true });

    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    expect(mockSaveConfig.mock.calls[0][0].tools.map((t: ComplianceToolConfig) => t.slug)).toEqual([
      "other",
      "kids-volunteers",
    ]);
    expect(mockSaveFeatureAccess).toHaveBeenCalledWith({
      admin: { label: "Admin", description: "", allowedGroupIds: [] },
      "compliance:kids-volunteers": {
        label: "Kids Volunteers",
        description: "Compliance for kids ministry volunteers",
        allowedGroupIds: [],
      },
    });
    expect(mockClearCache).toHaveBeenCalledWith("kids-volunteers");
  });

  it("refuses a duplicate slug when isNew is set, without writing anything", async () => {
    const existing = makeTool({ toolName: "Original" });
    config = { tools: [existing] };

    await expect(saveComplianceToolAction(makeTool({ toolName: "Copy" }), true)).resolves.toEqual({
      success: false,
      error: "slug: A tool with this slug already exists.",
    });
    expect(config.tools).toEqual([existing]);
    expect(mockSaveConfig).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("replaces the existing tool in place when editing (isNew false/omitted)", async () => {
    config = {
      tools: [makeTool({ slug: "a" }), makeTool({ toolName: "Old name" }), makeTool({ slug: "c" })],
    };
    const edited = makeTool({ toolName: "New name" });

    await expect(saveComplianceToolAction(edited)).resolves.toEqual({ success: true });

    const saved: ComplianceToolsConfig = mockSaveConfig.mock.calls[0][0];
    expect(saved.tools).toHaveLength(3);
    expect(saved.tools[1]).toEqual(edited);
    expect(saved.tools.map((t) => t.slug)).toEqual(["a", "kids-volunteers", "c"]);
    expect(mockClearCache).toHaveBeenCalledWith("kids-volunteers");
  });

  it("appends when editing a slug not yet in the config (upsert)", async () => {
    config = { tools: [makeTool({ slug: "a" })] };
    await expect(saveComplianceToolAction(makeTool(), false)).resolves.toEqual({ success: true });
    expect(mockSaveConfig.mock.calls[0][0].tools.map((t: ComplianceToolConfig) => t.slug)).toEqual([
      "a",
      "kids-volunteers",
    ]);
  });

  it("does not overwrite an existing feature-access entry (keeps its group grants)", async () => {
    featureAccess = {
      "compliance:kids-volunteers": { label: "Old label", description: "old", allowedGroupIds: [7, 8] },
    };

    await expect(saveComplianceToolAction(makeTool({ toolName: "New label" }))).resolves.toEqual({
      success: true,
    });

    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(featureAccess["compliance:kids-volunteers"].allowedGroupIds).toEqual([7, 8]);
    expect(mockClearCache).toHaveBeenCalledWith("kids-volunteers");
  });

  it("does not register a feature key for a disabled tool", async () => {
    await expect(saveComplianceToolAction(makeTool({ enabled: false }), true)).resolves.toEqual({
      success: true,
    });
    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    expect(mockLoadFeatureAccess).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).toHaveBeenCalledWith("kids-volunteers");
  });

  it("formats a Zod error as 'field: message' and writes nothing", async () => {
    const result = await saveComplianceToolAction(makeTool({ slug: "Bad Slug!" }), true);

    expect(result).toEqual({
      success: false,
      error: "slug: Slug must be lowercase alphanumeric with hyphens",
    });
    expect(mockLoadConfig).not.toHaveBeenCalled();
    expect(mockSaveConfig).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("joins multiple Zod issues with '; ' and uses dotted paths for nested fields", async () => {
    const tool = makeTool({
      toolName: "",
      groupRoleIds: [-1],
      requirements: [{ requirementId: 1, label: "", type: "form", sortOrder: 0, visible: true }],
    });

    const result = await saveComplianceToolAction(tool, true);

    expect(result.success).toBe(false);
    const parts = result.error!.split("; ");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^toolName: /);
    expect(parts[1]).toMatch(/^groupRoleIds\.0: /);
    expect(parts[2]).toMatch(/^requirements\.0\.label: /);
    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  it("reports the refine rule against programId when a journey is attached without a program", async () => {
    const result = await saveComplianceToolAction(makeTool({ journeyId: 12, programId: null }), true);
    expect(result).toEqual({ success: false, error: "programId: Program is required when a journey is attached" });
    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  it("labels a root-level Zod issue as 'config'", async () => {
    const result = await saveComplianceToolAction(null as unknown as ComplianceToolConfig, true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/^config: /);
    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  it("returns the error message when the config write fails, and skips cache clearing", async () => {
    mockSaveConfig.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    await expect(saveComplianceToolAction(makeTool(), true)).resolves.toEqual({
      success: false,
      error: "EACCES: permission denied",
    });
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-Error throw", async () => {
    mockLoadConfig.mockImplementation(() => {
      throw "boom";
    });
    await expect(saveComplianceToolAction(makeTool(), true)).resolves.toEqual({
      success: false,
      error: "Failed to save compliance tool",
    });
  });

  it("returns an error when feature-access registration fails after the config was saved", async () => {
    mockSaveFeatureAccess.mockImplementation(() => {
      throw new Error("disk full");
    });

    await expect(saveComplianceToolAction(makeTool(), true)).resolves.toEqual({
      success: false,
      error: "disk full",
    });
    // CURRENT BEHAVIOUR: the tool config was already persisted (not atomic) and
    // the processing-service cache is left stale for this slug.
    expect(mockSaveConfig).toHaveBeenCalledTimes(1);
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("CURRENT BEHAVIOUR (reported): persists the raw input, so keys outside the schema reach the config file", async () => {
    // validateComplianceToolConfig's parsed (stripped) result is discarded and
    // the caller-shaped `tool` object is saved instead.
    const tool = { ...makeTool(), injected: "<script>" } as unknown as ComplianceToolConfig;

    await expect(saveComplianceToolAction(tool, true)).resolves.toEqual({ success: true });

    const saved = mockSaveConfig.mock.calls[0][0].tools[0] as Record<string, unknown>;
    expect(saved.injected).toBe("<script>");
  });
});

// ---------------------------------------------------------------------------
// deleteComplianceToolAction
// ---------------------------------------------------------------------------

describe("deleteComplianceToolAction", () => {
  it("returns a generic error and performs no write for a non-admin", async () => {
    mockRequireFeatureAccess.mockRejectedValue(FORBIDDEN);

    await expect(deleteComplianceToolAction("kids-volunteers")).resolves.toEqual({
      success: false,
      error: "Failed to delete compliance tool",
    });
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("admin");
    expect(mockLoadConfig).not.toHaveBeenCalled();
    expect(mockSaveConfig).not.toHaveBeenCalled();
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it("removes only the matching tool and its feature key, then clears the service cache", async () => {
    config = { tools: [makeTool({ slug: "a" }), makeTool(), makeTool({ slug: "c" })] };
    featureAccess = {
      admin: { label: "Admin", description: "", allowedGroupIds: [1] },
      "compliance:a": { label: "A", description: "", allowedGroupIds: [] },
      "compliance:kids-volunteers": { label: "K", description: "", allowedGroupIds: [5] },
    };

    await expect(deleteComplianceToolAction("kids-volunteers")).resolves.toEqual({ success: true });

    expect(mockSaveConfig.mock.calls[0][0].tools.map((t: ComplianceToolConfig) => t.slug)).toEqual(["a", "c"]);
    expect(mockSaveFeatureAccess).toHaveBeenCalledWith({
      admin: { label: "Admin", description: "", allowedGroupIds: [1] },
      "compliance:a": { label: "A", description: "", allowedGroupIds: [] },
    });
    expect(mockClearCache).toHaveBeenCalledWith("kids-volunteers");
  });

  it("does not rewrite feature-access when there is no entry for the slug", async () => {
    config = { tools: [makeTool()] };

    await expect(deleteComplianceToolAction("kids-volunteers")).resolves.toEqual({ success: true });

    expect(mockSaveConfig.mock.calls[0][0].tools).toEqual([]);
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).toHaveBeenCalledWith("kids-volunteers");
  });

  it("succeeds (and still rewrites the config) for an unknown slug", async () => {
    config = { tools: [makeTool({ slug: "a" })] };
    await expect(deleteComplianceToolAction("missing")).resolves.toEqual({ success: true });
    expect(mockSaveConfig.mock.calls[0][0].tools.map((t: ComplianceToolConfig) => t.slug)).toEqual(["a"]);
  });

  it("does not leak the underlying error message on a write failure", async () => {
    mockSaveConfig.mockImplementation(() => {
      throw new Error("EACCES: /app/data/compliance-tools.json");
    });

    await expect(deleteComplianceToolAction("kids-volunteers")).resolves.toEqual({
      success: false,
      error: "Failed to delete compliance tool",
    });
    expect(mockSaveFeatureAccess).not.toHaveBeenCalled();
    expect(mockClearCache).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe("rate limiting", () => {
  // CURRENT BEHAVIOUR (reported as a gap): .claude/rules/security.md asks write
  // actions to call enforceRateLimit(session.user.id, "write"). These admin
  // writes rely only on the "general" tier applied inside requireSession() (via
  // requireFeatureAccess). If the write tier is added, flip these assertions.
  it("save does not apply the write tier", async () => {
    await saveComplianceToolAction(makeTool(), true);
    expect(mockSaveConfig).toHaveBeenCalled();
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
  });

  it("delete does not apply the write tier", async () => {
    await deleteComplianceToolAction("kids-volunteers");
    expect(mockSaveConfig).toHaveBeenCalled();
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
  });
});
