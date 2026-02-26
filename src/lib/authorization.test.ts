import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import {
  getAdminGroupIds,
  isSuperAdmin,
  loadFeatureAccess,
  saveFeatureAccess,
  hasFeatureAccess,
  getAccessibleFeatures,
} from "@/lib/authorization";

vi.mock(import("fs"), async (importOriginal) => {
  const actual = await importOriginal();
  const mocked = {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
  return { ...mocked, default: mocked };
});

const mockConfig = {
  dashboard: {
    label: "Executive Dashboard",
    description: "View metrics",
    allowedGroupIds: [29, 45],
  },
  "volunteer-processing": {
    label: "Volunteer Processing",
    description: "Manage volunteers",
    allowedGroupIds: [52],
  },
  "baptism-processing": {
    label: "Baptism Processing",
    description: "Manage baptism",
    allowedGroupIds: [],
  },
};

describe("authorization", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getAdminGroupIds", () => {
    it("should parse comma-separated IDs from env", () => {
      process.env.ADMIN_USER_GROUP_IDS = "29,42,53";
      expect(getAdminGroupIds()).toEqual([29, 42, 53]);
    });

    it("should handle single ID", () => {
      process.env.ADMIN_USER_GROUP_IDS = "29";
      expect(getAdminGroupIds()).toEqual([29]);
    });

    it("should return empty array when env is not set", () => {
      delete process.env.ADMIN_USER_GROUP_IDS;
      expect(getAdminGroupIds()).toEqual([]);
    });

    it("should filter out non-numeric values", () => {
      process.env.ADMIN_USER_GROUP_IDS = "29,abc,42";
      expect(getAdminGroupIds()).toEqual([29, 42]);
    });

    it("should handle whitespace", () => {
      process.env.ADMIN_USER_GROUP_IDS = " 29 , 42 ";
      expect(getAdminGroupIds()).toEqual([29, 42]);
    });

    it("should filter out zero and negative numbers", () => {
      process.env.ADMIN_USER_GROUP_IDS = "0,-1,29";
      expect(getAdminGroupIds()).toEqual([29]);
    });
  });

  describe("isSuperAdmin", () => {
    it("should return true when user has an admin group ID", () => {
      process.env.ADMIN_USER_GROUP_IDS = "29,42";
      expect(isSuperAdmin([29, 100])).toBe(true);
    });

    it("should return false when user has no admin group IDs", () => {
      process.env.ADMIN_USER_GROUP_IDS = "29,42";
      expect(isSuperAdmin([100, 200])).toBe(false);
    });

    it("should return false when env is not set", () => {
      delete process.env.ADMIN_USER_GROUP_IDS;
      expect(isSuperAdmin([29])).toBe(false);
    });

    it("should return false for empty user group IDs", () => {
      process.env.ADMIN_USER_GROUP_IDS = "29";
      expect(isSuperAdmin([])).toBe(false);
    });
  });

  describe("loadFeatureAccess", () => {
    it("should return defaults when config file does not exist", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const config = loadFeatureAccess();
      expect(config).toHaveProperty("dashboard");
      expect(config).toHaveProperty("volunteer-processing");
      expect(config.dashboard.allowedGroupIds).toEqual([]);
    });

    it("should load config from file when it exists", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const config = loadFeatureAccess();
      expect(config.dashboard.allowedGroupIds).toEqual([29, 45]);
      expect(config["volunteer-processing"].allowedGroupIds).toEqual([52]);
    });

    it("should merge with defaults for new features not in config", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      // Config missing some features that are in defaults
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          dashboard: { label: "Dashboard", description: "desc", allowedGroupIds: [29] },
        })
      );

      const config = loadFeatureAccess();
      expect(config.dashboard.allowedGroupIds).toEqual([29]);
      // Default features should be present
      expect(config).toHaveProperty("volunteer-processing");
      expect(config).toHaveProperty("contact-lookup");
    });
  });

  describe("saveFeatureAccess", () => {
    it("should create directory and write file", () => {
      vi.mocked(existsSync).mockReturnValue(false);
      saveFeatureAccess(mockConfig);

      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFileSync).mock.calls[0][1] as string;
      expect(JSON.parse(writtenContent)).toEqual(mockConfig);
    });
  });

  describe("hasFeatureAccess", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    });

    it("should return true for super-admins regardless of feature config", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      expect(hasFeatureAccess([99], "dashboard")).toBe(true);
      expect(hasFeatureAccess([99], "admin")).toBe(true);
    });

    it("should return true when user has an allowed group ID", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      expect(hasFeatureAccess([45], "dashboard")).toBe(true);
    });

    it("should return false when user has no allowed group IDs", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      expect(hasFeatureAccess([100], "dashboard")).toBe(false);
    });

    it("should return false for admin feature when not super-admin", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      expect(hasFeatureAccess([29], "admin")).toBe(false);
    });

    it("should return false for unknown features", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      expect(hasFeatureAccess([29], "nonexistent" as never)).toBe(false);
    });

    it("should return false for features with empty allowedGroupIds", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      expect(hasFeatureAccess([100], "baptism-processing")).toBe(false);
    });
  });

  describe("getAccessibleFeatures", () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    });

    it("should return all features for super-admins", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      const features = getAccessibleFeatures([99]);
      expect(features).toContain("dashboard");
      expect(features).toContain("admin");
      expect(features).toContain("volunteer-processing");
    });

    it("should return only allowed features for regular users", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      const features = getAccessibleFeatures([45]);
      expect(features).toContain("dashboard");
      expect(features).not.toContain("admin");
      expect(features).not.toContain("volunteer-processing");
    });

    it("should return empty for users with no matching groups", () => {
      process.env.ADMIN_USER_GROUP_IDS = "99";
      const features = getAccessibleFeatures([999]);
      expect(features).toEqual([]);
    });
  });
});
