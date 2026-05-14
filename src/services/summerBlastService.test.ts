import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SummerBlastService,
  getEventExpirationStatus,
  buildEnrollmentNotes,
} from "@/services/summerBlastService";

// Mock the config loader so tests don't depend on the JSON file.
vi.mock("@/lib/summer-blast-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/summer-blast-config")>(
    "@/lib/summer-blast-config",
  );
  return {
    ...actual,
    getSummerBlastConfig: () => ({
      eventName: "Summer Blast",
      eventEndDate: "2026-07-31",
      intakeOpportunityId: 85,
      trackingGroupId: 1031,
      tempGroupRoleId: 1,
      cppFormId: 83,
      mandatedReporterCertId: 10,
      youthGroupId: 964,
      youthRequirementLabel: "Youth Assistant Form (Group 964)",
      intakeRequirements: [
        { requirementId: 0, label: "Background Check", type: "background_check" as const, sortOrder: 1 },
        { requirementId: 83, label: "CPP", type: "form" as const, sortOrder: 2 },
        { requirementId: 10, label: "Mandated Reporter", type: "certification" as const, sortOrder: 3 },
      ],
      roleConfigs: [
        {
          groupRoleId: 48,
          label: "Summer Blast Volunteer - Nursery",
          requirements: [
            { requirementId: 0, label: "Background Check", type: "background_check" as const, sortOrder: 1 },
            { requirementId: 83, label: "CPP", type: "form" as const, sortOrder: 2 },
            { requirementId: 10, label: "Mandated Reporter", type: "certification" as const, sortOrder: 3 },
          ],
        },
        {
          groupRoleId: 42,
          label: "Summer Blast Volunteer - Chow",
          requirements: [
            { requirementId: 83, label: "CPP", type: "form" as const, sortOrder: 1 },
          ],
        },
      ],
    }),
  };
});

// Provide a controllable MPHelper mock.
const mockGetTableRecords = vi.fn();
const mockCreateTableRecords = vi.fn();
const mockUpdateTableRecords = vi.fn();

vi.mock("@/lib/providers/ministry-platform", () => ({
  MPHelper: class {
    getTableRecords = mockGetTableRecords;
    createTableRecords = mockCreateTableRecords;
    updateTableRecords = mockUpdateTableRecords;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the SummerBlastService singleton.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (SummerBlastService as any).instance = null;
});

describe("getEventExpirationStatus", () => {
  const cutoff = new Date(2026, 6, 31); // 2026-07-31 local

  it("returns complete for null expiration", () => {
    expect(getEventExpirationStatus(null, cutoff, new Date(2026, 4, 1))).toBe("complete");
  });

  it("returns expired for past dates", () => {
    expect(
      getEventExpirationStatus("2026-01-15T00:00:00", cutoff, new Date(2026, 4, 1)),
    ).toBe("expired");
  });

  it("returns will_expire when between now and cutoff", () => {
    expect(
      getEventExpirationStatus("2026-07-01T00:00:00", cutoff, new Date(2026, 4, 1)),
    ).toBe("will_expire");
  });

  it("returns complete when expires on/after cutoff", () => {
    expect(
      getEventExpirationStatus("2026-08-15T00:00:00", cutoff, new Date(2026, 4, 1)),
    ).toBe("complete");
  });

  it("treats expiring on the cutoff itself as complete (boundary)", () => {
    // The function uses strict <, so 'expires equals cutoff' is NOT will_expire.
    const sameDay = "2026-07-31T00:00:00";
    expect(getEventExpirationStatus(sameDay, cutoff, new Date(2026, 4, 1))).toBe(
      "complete",
    );
  });
});

describe("SummerBlastService.getIntakeCards", () => {
  it("returns open responses with checklist using intake requirements", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Responses") {
        return Promise.resolve([
          {
            Response_ID: 9001,
            Response_Date: "2026-05-01T10:00:00",
            Opportunity_ID: 85,
            Participant_ID: 1111,
            Closed: false,
            Comments: null,
          },
        ]);
      }
      if (params.table === "Participants") {
        return Promise.resolve([{ Participant_ID: 1111, Contact_ID: 2222 }]);
      }
      if (params.table === "Contacts") {
        return Promise.resolve([
          {
            Contact_ID: 2222,
            First_Name: "Sample",
            Nickname: null,
            Last_Name: "Person",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: null,
          },
        ]);
      }
      // No bg checks / certs / form responses
      return Promise.resolve([]);
    });

    const service = SummerBlastService.getInstance();
    const cards = await service.getIntakeCards();
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.responseId).toBe(9001);
    expect(card.info.Contact_ID).toBe(2222);
    expect(card.checklist).toHaveLength(3);
    // All three requirements should be not_started since no records exist.
    expect(card.checklist.every((c) => c.status === "not_started")).toBe(true);
    expect(card.completedCount).toBe(0);
    expect(card.totalCount).toBe(3);
    expect(card.isFullyCompliant).toBe(false);
    expect(card.hasWillExpire).toBe(false);
  });

  it("flags will_expire when a form expires before cutoff", async () => {
    // Use vi.setSystemTime so the service's internal `new Date()` is deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00Z"));

    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Responses") {
        return Promise.resolve([
          {
            Response_ID: 9002,
            Response_Date: "2026-04-01T10:00:00",
            Opportunity_ID: 85,
            Participant_ID: 2000,
            Closed: false,
            Comments: null,
          },
        ]);
      }
      if (params.table === "Participants") {
        return Promise.resolve([{ Participant_ID: 2000, Contact_ID: 3000 }]);
      }
      if (params.table === "Contacts") {
        return Promise.resolve([
          {
            Contact_ID: 3000,
            First_Name: "Will",
            Nickname: null,
            Last_Name: "Expirepre",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: null,
          },
        ]);
      }
      if (params.table === "Form_Responses") {
        return Promise.resolve([
          {
            Form_Response_ID: 700,
            Form_ID: 83,
            Contact_ID: 3000,
            Response_Date: "2025-08-01T00:00:00",
            // Expires after "today" (2026-05-13) but before cutoff (2026-07-31)
            Expires: "2026-07-01T00:00:00",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    try {
      const service = SummerBlastService.getInstance();
      const cards = await service.getIntakeCards();
      expect(cards).toHaveLength(1);
      const cpp = cards[0].checklist.find((c) => c.type === "form");
      expect(cpp).toBeDefined();
      expect(cpp!.status).toBe("will_expire");
      expect(cards[0].hasWillExpire).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("dedupes responses by participant, keeping most recent", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Responses") {
        return Promise.resolve([
          {
            Response_ID: 10,
            Response_Date: "2026-01-01T10:00:00",
            Opportunity_ID: 85,
            Participant_ID: 7,
            Closed: false,
            Comments: null,
          },
          {
            Response_ID: 11,
            Response_Date: "2026-04-01T10:00:00",
            Opportunity_ID: 85,
            Participant_ID: 7,
            Closed: false,
            Comments: null,
          },
        ]);
      }
      if (params.table === "Participants")
        return Promise.resolve([{ Participant_ID: 7, Contact_ID: 9 }]);
      if (params.table === "Contacts")
        return Promise.resolve([
          {
            Contact_ID: 9,
            First_Name: "Dup",
            Nickname: null,
            Last_Name: "Test",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: null,
          },
        ]);
      return Promise.resolve([]);
    });

    const service = SummerBlastService.getInstance();
    const cards = await service.getIntakeCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].responseId).toBe(11);
  });
});

describe("SummerBlastService.getVolunteerCards", () => {
  it("uses role-specific requirements", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Group_Participants") {
        return Promise.resolve([
          {
            Group_Participant_ID: 555,
            Participant_ID: 100,
            Group_ID: 1031,
            // Chow — should only require CPP
            Group_Role_ID: 42,
            Start_Date: "2026-05-01T00:00:00",
            End_Date: null,
          },
        ]);
      }
      if (params.table === "Participants")
        return Promise.resolve([{ Participant_ID: 100, Contact_ID: 200 }]);
      if (params.table === "Contacts")
        return Promise.resolve([
          {
            Contact_ID: 200,
            First_Name: "Chow",
            Nickname: null,
            Last_Name: "Volunteer",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: null,
          },
        ]);
      return Promise.resolve([]);
    });

    const service = SummerBlastService.getInstance();
    const cards = await service.getVolunteerCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].groupRoleId).toBe(42);
    expect(cards[0].groupRoleLabel).toContain("Chow");
    expect(cards[0].checklist).toHaveLength(1);
    expect(cards[0].checklist[0].type).toBe("form");
  });

  it("falls back to intake requirements for Temp role (id 1)", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Group_Participants") {
        return Promise.resolve([
          {
            Group_Participant_ID: 556,
            Participant_ID: 101,
            Group_ID: 1031,
            Group_Role_ID: 1,
            Start_Date: "2026-05-01T00:00:00",
            End_Date: null,
          },
        ]);
      }
      if (params.table === "Participants")
        return Promise.resolve([{ Participant_ID: 101, Contact_ID: 201 }]);
      if (params.table === "Contacts")
        return Promise.resolve([
          {
            Contact_ID: 201,
            First_Name: "Temp",
            Nickname: null,
            Last_Name: "Volunteer",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: null,
          },
        ]);
      return Promise.resolve([]);
    });

    const service = SummerBlastService.getInstance();
    const cards = await service.getVolunteerCards();
    expect(cards).toHaveLength(1);
    // Intake requirements has 3 items (BG, CPP, MR)
    expect(cards[0].checklist).toHaveLength(3);
    expect(cards[0].groupRoleLabel).toMatch(/Group Role 1/);
  });

  it("excludes participants with non-null End_Date in the past", async () => {
    // Service filters End_Date IS NULL OR End_Date >= now at the SQL level —
    // the test just verifies the filter is in the call.
    mockGetTableRecords.mockImplementation((params: { table: string; filter?: string }) => {
      if (params.table === "Group_Participants") {
        expect(params.filter).toContain("End_Date IS NULL OR End_Date >=");
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    const service = SummerBlastService.getInstance();
    const cards = await service.getVolunteerCards();
    expect(cards).toEqual([]);
  });

  it("under-18 with active Group 964 membership shows single complete youth item", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00Z"));
    mockGetTableRecords.mockImplementation((params: { table: string; filter?: string }) => {
      if (params.table === "Group_Participants" && params.filter?.includes("Group_ID = 1031")) {
        return Promise.resolve([
          {
            Group_Participant_ID: 700,
            Participant_ID: 300,
            Group_ID: 1031,
            Group_Role_ID: 51,
            Start_Date: "2026-05-01T00:00:00",
            End_Date: null,
            Notes: null,
          },
        ]);
      }
      if (params.table === "Group_Participants" && params.filter?.includes("Group_ID = 964")) {
        // Youth IS a member of Group 964
        return Promise.resolve([{ Participant_ID: 300 }]);
      }
      if (params.table === "Participants")
        return Promise.resolve([{ Participant_ID: 300, Contact_ID: 400 }]);
      if (params.table === "Contacts")
        return Promise.resolve([
          {
            Contact_ID: 400,
            First_Name: "Young",
            Nickname: null,
            Last_Name: "Volunteer",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: "2010-01-15T00:00:00", // age 16 at 2026-05-13
          },
        ]);
      return Promise.resolve([]);
    });

    try {
      const service = SummerBlastService.getInstance();
      const cards = await service.getVolunteerCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].age).toBe(16);
      expect(cards[0].checklist).toHaveLength(1);
      expect(cards[0].checklist[0].type).toBe("group_membership");
      expect(cards[0].checklist[0].status).toBe("complete");
      expect(cards[0].isFullyCompliant).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("under-18 without Group 964 membership shows single not_started youth item", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00Z"));
    mockGetTableRecords.mockImplementation((params: { table: string; filter?: string }) => {
      if (params.table === "Group_Participants" && params.filter?.includes("Group_ID = 1031")) {
        return Promise.resolve([
          {
            Group_Participant_ID: 701,
            Participant_ID: 301,
            Group_ID: 1031,
            Group_Role_ID: 51,
            Start_Date: "2026-05-01T00:00:00",
            End_Date: null,
            Notes: null,
          },
        ]);
      }
      if (params.table === "Group_Participants" && params.filter?.includes("Group_ID = 964")) {
        // Youth is NOT a member
        return Promise.resolve([]);
      }
      if (params.table === "Participants")
        return Promise.resolve([{ Participant_ID: 301, Contact_ID: 401 }]);
      if (params.table === "Contacts")
        return Promise.resolve([
          {
            Contact_ID: 401,
            First_Name: "Pending",
            Nickname: null,
            Last_Name: "Youth",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: "2010-01-15T00:00:00",
          },
        ]);
      return Promise.resolve([]);
    });

    try {
      const service = SummerBlastService.getInstance();
      const cards = await service.getVolunteerCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].checklist).toHaveLength(1);
      expect(cards[0].checklist[0].status).toBe("not_started");
      expect(cards[0].isFullyCompliant).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("18+ adult uses role-based requirements, not youth path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T12:00:00Z"));
    mockGetTableRecords.mockImplementation((params: { table: string; filter?: string }) => {
      if (params.table === "Group_Participants" && params.filter?.includes("Group_ID = 1031")) {
        return Promise.resolve([
          {
            Group_Participant_ID: 702,
            Participant_ID: 302,
            Group_ID: 1031,
            Group_Role_ID: 42, // Chow → CPP only
            Start_Date: "2026-05-01T00:00:00",
            End_Date: null,
            Notes: null,
          },
        ]);
      }
      if (params.table === "Participants")
        return Promise.resolve([{ Participant_ID: 302, Contact_ID: 402 }]);
      if (params.table === "Contacts")
        return Promise.resolve([
          {
            Contact_ID: 402,
            First_Name: "Adult",
            Nickname: null,
            Last_Name: "Volunteer",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: "1990-01-15T00:00:00", // 36
          },
        ]);
      return Promise.resolve([]);
    });

    try {
      const service = SummerBlastService.getInstance();
      const cards = await service.getVolunteerCards();
      expect(cards).toHaveLength(1);
      expect(cards[0].age).toBe(36);
      // Chow role config has only CPP (1 item), not the group_membership item
      expect(cards[0].checklist).toHaveLength(1);
      expect(cards[0].checklist[0].type).toBe("form");
    } finally {
      vi.useRealTimers();
    }
  });

  it("null DOB takes adult path", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string; filter?: string }) => {
      if (params.table === "Group_Participants" && params.filter?.includes("Group_ID = 1031")) {
        return Promise.resolve([
          {
            Group_Participant_ID: 703,
            Participant_ID: 303,
            Group_ID: 1031,
            Group_Role_ID: 1,
            Start_Date: "2026-05-01T00:00:00",
            End_Date: null,
            Notes: null,
          },
        ]);
      }
      if (params.table === "Participants")
        return Promise.resolve([{ Participant_ID: 303, Contact_ID: 403 }]);
      if (params.table === "Contacts")
        return Promise.resolve([
          {
            Contact_ID: 403,
            First_Name: "No",
            Nickname: null,
            Last_Name: "Birthday",
            Image_GUID: null,
            Email_Address: null,
            Mobile_Phone: null,
            Date_of_Birth: null,
          },
        ]);
      return Promise.resolve([]);
    });

    const service = SummerBlastService.getInstance();
    const cards = await service.getVolunteerCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].age).toBeNull();
    // Temp role 1 falls back to intake requirements (3 items)
    expect(cards[0].checklist).toHaveLength(3);
    expect(cards[0].checklist.every((c) => c.type !== "group_membership")).toBe(true);
  });
});

describe("SummerBlastService.addToSummerBlast", () => {
  it("creates Group_Participants with notes copied from Response, then closes Response", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Participants") {
        return Promise.resolve([{ Participant_ID: 50, Contact_ID: 99 }]);
      }
      if (params.table === "Responses") {
        return Promise.resolve([
          {
            Response_ID: 444,
            Response_Date: "2026-04-10T10:00:00",
            Opportunity_ID: 85,
            Participant_ID: 50,
            Closed: false,
            Comments: "Available Thursday only",
          },
        ]);
      }
      return Promise.resolve([]);
    });
    mockCreateTableRecords.mockResolvedValueOnce([{ Group_Participant_ID: 1234 }]);
    mockUpdateTableRecords.mockResolvedValueOnce(undefined);

    const service = SummerBlastService.getInstance();
    const result = await service.addToSummerBlast({
      contactId: 99,
      responseId: 444,
      groupRoleId: 48,
    });
    expect(result.groupParticipantId).toBe(1234);

    expect(mockCreateTableRecords).toHaveBeenCalledWith(
      "Group_Participants",
      [
        expect.objectContaining({
          Group_ID: 1031,
          Participant_ID: 50,
          Group_Role_ID: 48,
          Notes: "Signed up 2026-04-10 — Available Thursday only",
        }),
      ],
      expect.any(Object),
    );
    expect(mockUpdateTableRecords).toHaveBeenCalledWith(
      "Responses",
      [{ Response_ID: 444, Closed: true }],
      expect.any(Object),
    );
  });

  it("omits Notes when the Response has no comments and no record is found", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Participants") {
        return Promise.resolve([{ Participant_ID: 51, Contact_ID: 101 }]);
      }
      // Response not found
      return Promise.resolve([]);
    });
    mockCreateTableRecords.mockResolvedValueOnce([{ Group_Participant_ID: 1235 }]);
    mockUpdateTableRecords.mockResolvedValueOnce(undefined);

    const service = SummerBlastService.getInstance();
    await service.addToSummerBlast({
      contactId: 101,
      responseId: 445,
      groupRoleId: 48,
    });

    const created = mockCreateTableRecords.mock.calls[0][1][0];
    expect(created).not.toHaveProperty("Notes");
  });

  it("falls back to tempGroupRoleId when no role provided", async () => {
    mockGetTableRecords.mockImplementation((params: { table: string }) => {
      if (params.table === "Participants") {
        return Promise.resolve([{ Participant_ID: 60, Contact_ID: 100 }]);
      }
      if (params.table === "Responses") {
        return Promise.resolve([
          {
            Response_ID: 555,
            Response_Date: "2026-04-10T10:00:00",
            Opportunity_ID: 85,
            Participant_ID: 60,
            Closed: false,
            Comments: null,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    mockCreateTableRecords.mockResolvedValueOnce([{ Group_Participant_ID: 9 }]);
    mockUpdateTableRecords.mockResolvedValueOnce(undefined);

    const service = SummerBlastService.getInstance();
    await service.addToSummerBlast({
      contactId: 100,
      responseId: 555,
      groupRoleId: null,
    });
    expect(mockCreateTableRecords).toHaveBeenCalledWith(
      "Group_Participants",
      [expect.objectContaining({ Group_Role_ID: 1 })],
      expect.any(Object),
    );
  });

  it("throws if Contact has no Participant", async () => {
    mockGetTableRecords.mockImplementation(() => Promise.resolve([]));
    const service = SummerBlastService.getInstance();
    await expect(
      service.addToSummerBlast({ contactId: 999, responseId: 1, groupRoleId: 42 }),
    ).rejects.toThrow(/No Participant record/);
  });
});

describe("buildEnrollmentNotes", () => {
  it("returns null when no response", () => {
    expect(buildEnrollmentNotes(null)).toBeNull();
  });
  it("returns just the date when no comments", () => {
    expect(
      buildEnrollmentNotes({ Response_Date: "2026-04-10T10:00:00", Comments: null }),
    ).toBe("Signed up 2026-04-10");
  });
  it("returns just the date when comments are whitespace", () => {
    expect(
      buildEnrollmentNotes({ Response_Date: "2026-04-10T10:00:00", Comments: "   " }),
    ).toBe("Signed up 2026-04-10");
  });
  it("appends comments after an em-dash", () => {
    expect(
      buildEnrollmentNotes({ Response_Date: "2026-04-10T10:00:00", Comments: "Hi" }),
    ).toBe("Signed up 2026-04-10 — Hi");
  });
  it("truncates to 500 chars with an ellipsis", () => {
    const long = "x".repeat(1000);
    const out = buildEnrollmentNotes({ Response_Date: "2026-04-10T10:00:00", Comments: long });
    expect(out!.length).toBe(500);
    expect(out!.endsWith("…")).toBe(true);
  });
});

describe("SummerBlastService.removeFromSummerBlast", () => {
  it("sets End_Date and does NOT update Responses", async () => {
    mockUpdateTableRecords.mockResolvedValueOnce(undefined);
    const service = SummerBlastService.getInstance();
    await service.removeFromSummerBlast({ groupParticipantId: 888 });

    expect(mockUpdateTableRecords).toHaveBeenCalledTimes(1);
    expect(mockUpdateTableRecords).toHaveBeenCalledWith(
      "Group_Participants",
      [expect.objectContaining({ Group_Participant_ID: 888 })],
      expect.any(Object),
    );
    // Confirm no Responses write occurred
    const responseUpdates = mockUpdateTableRecords.mock.calls.filter(
      (call) => call[0] === "Responses",
    );
    expect(responseUpdates).toHaveLength(0);
  });
});

