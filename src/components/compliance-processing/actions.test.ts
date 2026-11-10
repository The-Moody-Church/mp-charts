import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockRequireFeatureAccess,
  mockGetComplianceToolBySlug,
  mockGetInstance,
  mockGetRequirementFiles,
  mockGetMilestoneFiles,
  mockEnforceRateLimit,
  mockExtractValidatedFiles,
  mockCreateMilestone,
  mockCreateCertification,
  mockCreateFormResponse,
  mockUploadDocument,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockGetComplianceToolBySlug: vi.fn(),
  mockGetInstance: vi.fn(),
  mockGetRequirementFiles: vi.fn(),
  mockGetMilestoneFiles: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockExtractValidatedFiles: vi.fn(),
  mockCreateMilestone: vi.fn(),
  mockCreateCertification: vi.fn(),
  mockCreateFormResponse: vi.fn(),
  mockUploadDocument: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireFeatureAccess: mockRequireFeatureAccess }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mockEnforceRateLimit }));
vi.mock("@/lib/auth-helpers", () => ({ getMpUserId: vi.fn() }));
vi.mock("@/lib/compliance-tools-config", () => ({ getComplianceToolBySlug: mockGetComplianceToolBySlug }));
vi.mock("@/components/shared-actions/processing", () => ({
  extractValidatedFiles: mockExtractValidatedFiles,
  extractValidatedFilesResult: vi.fn(),
  uploadContactPhoto: vi.fn(),
}));
// The mocked service has no getRecordFiles: an action calling the unscoped
// lookup would throw "is not a function" and fail these tests.
vi.mock("@/services/complianceProcessingService", () => ({
  ComplianceProcessingService: { getInstance: mockGetInstance },
}));

import {
  getComplianceRequirementFiles,
  getComplianceMilestoneFiles,
  createComplianceMilestone,
  createComplianceCertification,
  createComplianceFormResponse,
} from "./actions";

const FILES = [{ fileId: 1, fileName: "r.pdf", fileUrl: "https://mp.example/files/u-1", isPdf: true, isImage: false }];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetComplianceToolBySlug.mockImplementation((slug: string) => (slug === "tool-a" ? { slug, enabled: true } : null));
  mockRequireFeatureAccess.mockResolvedValue({ user: { id: "u1" } });
  mockGetInstance.mockReturnValue({
    getRequirementFiles: mockGetRequirementFiles,
    getMilestoneFiles: mockGetMilestoneFiles,
    createMilestone: mockCreateMilestone,
    createCertification: mockCreateCertification,
    createFormResponse: mockCreateFormResponse,
    uploadDocument: mockUploadDocument,
  });
  mockEnforceRateLimit.mockImplementation(() => {});
  mockExtractValidatedFiles.mockResolvedValue([]);
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

// A rejected attachment must leave nothing behind. These actions used to create
// the record first and validate the files after, so a bad file, or the upload
// rate limit, left a record without its attachment, and a retry made a duplicate.
describe.each([
  ["createComplianceMilestone", createComplianceMilestone, mockCreateMilestone, "Participant_Milestones", "Failed to create milestone"],
  ["createComplianceCertification", createComplianceCertification, mockCreateCertification, "Participant_Certifications", "Failed to create certification"],
  ["createComplianceFormResponse", createComplianceFormResponse, mockCreateFormResponse, "Form_Responses", "Failed to create form response"],
] as const)("%s attachment ordering", (_name, action, createMock, table, message) => {
  const file = new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" });
  const formData = () => {
    const fd = new FormData();
    fd.append("files", file);
    return fd;
  };

  it("writes nothing when an attachment is rejected", async () => {
    mockExtractValidatedFiles.mockRejectedValue(new Error("Invalid file type"));
    await expect(action("tool-a", formData())).rejects.toThrow(message);
    expect(createMock).not.toHaveBeenCalled();
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it("writes nothing when the upload rate limit is hit", async () => {
    mockExtractValidatedFiles.mockResolvedValue([file]);
    mockEnforceRateLimit.mockImplementation((_id: string, tier: string) => {
      if (tier === "upload") throw new Error("Rate limit exceeded");
    });
    await expect(action("tool-a", formData())).rejects.toThrow(message);
    expect(createMock).not.toHaveBeenCalled();
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it("creates the record, then attaches the validated files to it", async () => {
    mockExtractValidatedFiles.mockResolvedValue([file]);
    createMock.mockResolvedValue(77);
    await expect(action("tool-a", formData())).resolves.toBeUndefined();
    expect(mockExtractValidatedFiles.mock.invocationCallOrder[0]).toBeLessThan(createMock.mock.invocationCallOrder[0]);
    expect(mockUploadDocument).toHaveBeenCalledWith(table, 77, [file], undefined);
  });

  it("skips the upload tier when there are no files", async () => {
    createMock.mockResolvedValue(77);
    await action("tool-a", new FormData());
    expect(mockEnforceRateLimit).not.toHaveBeenCalledWith("u1", "upload");
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });
});
