import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireFeatureAccess,
  mockEnforceRateLimit,
  mockGetMpUserId,
  mockAddToSummerBlast,
  mockRemoveFromSummerBlast,
  mockGetIntakeCards,
  mockGetVolunteerCards,
} = vi.hoisted(() => ({
  mockRequireFeatureAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockGetMpUserId: vi.fn(),
  mockAddToSummerBlast: vi.fn(),
  mockRemoveFromSummerBlast: vi.fn(),
  mockGetIntakeCards: vi.fn(),
  mockGetVolunteerCards: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  requireFeatureAccess: mockRequireFeatureAccess,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

vi.mock("@/lib/auth-helpers", () => ({
  getMpUserId: mockGetMpUserId,
}));

vi.mock("@/services/summerBlastService", () => ({
  SummerBlastService: {
    getInstance: vi.fn(() => ({
      addToSummerBlast: mockAddToSummerBlast,
      removeFromSummerBlast: mockRemoveFromSummerBlast,
      getIntakeCards: mockGetIntakeCards,
      getVolunteerCards: mockGetVolunteerCards,
    })),
  },
}));

import {
  getSummerBlastIntake,
  getSummerBlastVolunteers,
  bulkAddToSummerBlast,
} from "./actions";

const mockSession = { user: { id: "user-1" } };

describe("summer-blast-volunteers actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireFeatureAccess.mockResolvedValue(mockSession);
    mockGetMpUserId.mockReturnValue(99);
  });

  describe("getSummerBlastIntake (no cache)", () => {
    it("calls the service directly without cache", async () => {
      mockGetIntakeCards.mockResolvedValueOnce([]);
      await getSummerBlastIntake();
      expect(mockRequireFeatureAccess).toHaveBeenCalledWith("summer-blast-volunteers");
      expect(mockGetIntakeCards).toHaveBeenCalledTimes(1);
    });

    it("propagates errors as a thrown user-facing error", async () => {
      mockGetIntakeCards.mockRejectedValueOnce(new Error("MP down"));
      await expect(getSummerBlastIntake()).rejects.toThrow("Failed to load Summer Blast intake");
    });
  });

  describe("getSummerBlastVolunteers (no cache)", () => {
    it("calls the service directly without cache", async () => {
      mockGetVolunteerCards.mockResolvedValueOnce([]);
      await getSummerBlastVolunteers();
      expect(mockRequireFeatureAccess).toHaveBeenCalledWith("summer-blast-volunteers");
      expect(mockGetVolunteerCards).toHaveBeenCalledTimes(1);
    });
  });

  describe("bulkAddToSummerBlast", () => {
    it("returns success: false when items list is empty", async () => {
      const result = await bulkAddToSummerBlast([]);
      expect(result).toEqual({ success: false, succeededCount: 0, failures: [] });
      expect(mockAddToSummerBlast).not.toHaveBeenCalled();
    });

    it("adds all items with null groupRoleId (defaults to Temp in service)", async () => {
      mockAddToSummerBlast.mockResolvedValue({ groupParticipantId: 1 });
      const result = await bulkAddToSummerBlast([
        { contactId: 10, responseId: 100 },
        { contactId: 20, responseId: 200 },
      ]);
      expect(mockEnforceRateLimit).toHaveBeenCalledWith("user-1", "write");
      expect(mockAddToSummerBlast).toHaveBeenCalledTimes(2);
      expect(mockAddToSummerBlast).toHaveBeenNthCalledWith(1, {
        contactId: 10,
        responseId: 100,
        groupRoleId: null,
        userId: 99,
      });
      expect(mockAddToSummerBlast).toHaveBeenNthCalledWith(2, {
        contactId: 20,
        responseId: 200,
        groupRoleId: null,
        userId: 99,
      });
      expect(result).toEqual({ success: true, succeededCount: 2, failures: [] });
    });

    it("continues past failures and reports each one by responseId", async () => {
      mockAddToSummerBlast
        .mockResolvedValueOnce({ groupParticipantId: 1 })
        .mockRejectedValueOnce(new Error("no participant"))
        .mockResolvedValueOnce({ groupParticipantId: 2 });
      const result = await bulkAddToSummerBlast([
        { contactId: 10, responseId: 100 },
        { contactId: 20, responseId: 200 },
        { contactId: 30, responseId: 300 },
      ]);
      expect(mockAddToSummerBlast).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
      expect(result.succeededCount).toBe(2);
      expect(result.failures).toEqual([
        { responseId: 200, error: "no participant" },
      ]);
    });

    it("skips items missing contactId or responseId without calling the service", async () => {
      const result = await bulkAddToSummerBlast([
        { contactId: 0, responseId: 100 },
        { contactId: 10, responseId: 0 },
      ]);
      expect(mockAddToSummerBlast).not.toHaveBeenCalled();
      expect(result.succeededCount).toBe(0);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0].error).toBe("Missing required fields");
    });
  });
});
