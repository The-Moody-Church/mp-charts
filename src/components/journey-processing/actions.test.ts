import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockRequireFeatureAccess,
  mockGetJourneyToolBySlug,
  mockGetInstance,
  mockEnforceRateLimit,
  mockExtractValidatedFiles,
  mockCreateMilestone,
  mockUploadDocument,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockGetJourneyToolBySlug: vi.fn(),
  mockGetInstance: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockExtractValidatedFiles: vi.fn(),
  mockCreateMilestone: vi.fn(),
  mockUploadDocument: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireFeatureAccess: mockRequireFeatureAccess }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mockEnforceRateLimit }));
vi.mock("@/lib/auth-helpers", () => ({ getMpUserId: vi.fn() }));
vi.mock("@/lib/journey-tools-config", () => ({ getJourneyToolBySlug: mockGetJourneyToolBySlug }));
vi.mock("@/components/shared-actions/processing", () => ({
  extractValidatedFiles: mockExtractValidatedFiles,
  extractValidatedFilesResult: vi.fn(),
  uploadContactPhoto: vi.fn(),
}));
vi.mock("@/services/journeyProcessingService", () => ({
  JourneyProcessingService: { getInstance: mockGetInstance },
}));

import { createJourneyMilestone } from "./actions";

const file = new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" });
const formData = () => {
  const fd = new FormData();
  fd.append("files", file);
  return fd;
};

beforeEach(() => {
  mockGetJourneyToolBySlug.mockImplementation((slug: string) => (slug === "tool-a" ? { slug, enabled: true } : null));
  mockRequireFeatureAccess.mockResolvedValue({ user: { id: "u1" } });
  mockGetInstance.mockReturnValue({ createMilestone: mockCreateMilestone, uploadDocument: mockUploadDocument });
  mockEnforceRateLimit.mockImplementation(() => {});
  mockExtractValidatedFiles.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

// A rejected attachment must leave nothing behind. The action used to create the
// milestone first and validate the files after, so a bad file, or the upload rate
// limit, left a milestone without its attachment, and a retry made a duplicate.
describe("createJourneyMilestone attachment ordering", () => {
  it("writes nothing when an attachment is rejected", async () => {
    mockExtractValidatedFiles.mockRejectedValue(new Error("Invalid file type"));
    await expect(createJourneyMilestone("tool-a", formData())).rejects.toThrow("Failed to create milestone");
    expect(mockCreateMilestone).not.toHaveBeenCalled();
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });

  it("writes nothing when the upload rate limit is hit", async () => {
    mockExtractValidatedFiles.mockResolvedValue([file]);
    mockEnforceRateLimit.mockImplementation((_id: string, tier: string) => {
      if (tier === "upload") throw new Error("Rate limit exceeded");
    });
    await expect(createJourneyMilestone("tool-a", formData())).rejects.toThrow("Failed to create milestone");
    expect(mockCreateMilestone).not.toHaveBeenCalled();
  });

  it("creates the milestone, then attaches the validated files to it", async () => {
    mockExtractValidatedFiles.mockResolvedValue([file]);
    mockCreateMilestone.mockResolvedValue(77);
    await expect(createJourneyMilestone("tool-a", formData())).resolves.toBeUndefined();
    expect(mockExtractValidatedFiles.mock.invocationCallOrder[0]).toBeLessThan(mockCreateMilestone.mock.invocationCallOrder[0]);
    expect(mockUploadDocument).toHaveBeenCalledWith("Participant_Milestones", 77, [file], undefined);
  });

  it("skips the upload tier when there are no files", async () => {
    mockCreateMilestone.mockResolvedValue(77);
    await createJourneyMilestone("tool-a", new FormData());
    expect(mockEnforceRateLimit).not.toHaveBeenCalledWith("u1", "upload");
    expect(mockUploadDocument).not.toHaveBeenCalled();
  });
});
