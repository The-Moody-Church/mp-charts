import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockRequireFeatureAccess,
  mockGetComplianceToolBySlug,
  mockGetInstance,
  mockGetRequirementFiles,
  mockGetMilestoneFiles,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockGetComplianceToolBySlug: vi.fn(),
  mockGetInstance: vi.fn(),
  mockGetRequirementFiles: vi.fn(),
  mockGetMilestoneFiles: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireFeatureAccess: mockRequireFeatureAccess }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ getMpUserId: vi.fn() }));
vi.mock("@/lib/compliance-tools-config", () => ({ getComplianceToolBySlug: mockGetComplianceToolBySlug }));
vi.mock("@/components/shared-actions/processing", () => ({
  extractValidatedFiles: vi.fn(),
  extractValidatedFilesResult: vi.fn(),
  uploadContactPhoto: vi.fn(),
}));
// The mocked service has no getRecordFiles: an action calling the unscoped
// lookup would throw "is not a function" and fail these tests.
vi.mock("@/services/complianceProcessingService", () => ({
  ComplianceProcessingService: { getInstance: mockGetInstance },
}));

import { getComplianceRequirementFiles, getComplianceMilestoneFiles } from "./actions";

const FILES = [{ fileId: 1, fileName: "r.pdf", fileUrl: "https://mp.example/files/u-1", isPdf: true, isImage: false }];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetComplianceToolBySlug.mockImplementation((slug: string) => (slug === "tool-a" ? { slug, enabled: true } : null));
  mockRequireFeatureAccess.mockResolvedValue({ user: { id: "u1" } });
  mockGetInstance.mockReturnValue({ getRequirementFiles: mockGetRequirementFiles, getMilestoneFiles: mockGetMilestoneFiles });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("getComplianceRequirementFiles", () => {
  it("checks tool access, then delegates to the scoped service method", async () => {
    mockGetRequirementFiles.mockResolvedValue(FILES);
    await expect(getComplianceRequirementFiles("tool-a", "form", 42)).resolves.toEqual(FILES);
    expect(mockRequireFeatureAccess).toHaveBeenCalledWith("compliance:tool-a");
    expect(mockGetRequirementFiles).toHaveBeenCalledWith("form", 42);
  });

  it("rejects an unknown slug before reaching the service", async () => {
    await expect(getComplianceRequirementFiles("nope", "form", 42)).rejects.toThrow("Failed to fetch requirement files");
    expect(mockGetInstance).not.toHaveBeenCalled();
  });
});

describe.each([
  ["getComplianceRequirementFiles", () => getComplianceRequirementFiles("tool-a", "form", 42), mockGetRequirementFiles, "Failed to fetch requirement files"],
  ["getComplianceMilestoneFiles", () => getComplianceMilestoneFiles("tool-a", 42), mockGetMilestoneFiles, "Failed to fetch milestone files"],
] as const)("%s error logging (CodeQL js/log-injection)", (_name, call, serviceMock, message) => {
  it("logs a single sanitized line, never the raw Error, and rethrows a fixed message", async () => {
    serviceMock.mockRejectedValue(new Error("a\nb\r[scope] forged"));
    await expect(call()).rejects.toThrow(new RegExp(`^${message}$`));
    const logged = vi.mocked(console.error).mock.calls[0][1];
    expect(typeof logged).toBe("string");
    expect(logged).toBe("Error: ab[scope] forged");
  });
});
