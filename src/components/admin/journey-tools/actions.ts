"use server";

import { requireFeatureAccess, loadFeatureAccess, saveFeatureAccess } from "@/lib/authorization";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeFilterValue } from "@/lib/providers/ministry-platform/utils/filter-sanitize";
import {
  loadJourneyToolsConfig,
  saveJourneyToolsConfig,
  validateJourneyToolConfig,
  type JourneyToolConfig,
  type JourneyToolsConfig,
} from "@/lib/journey-tools-config";
import { JourneyProcessingService } from "@/services/journeyProcessingService";

// ---------------------------------------------------------------------------
// MP Data Queries
// ---------------------------------------------------------------------------

export interface MPJourney {
  Journey_ID: number;
  Journey_Name: string;
  Description: string | null;
  Active: boolean | null;
}

export async function getAvailableJourneys(): Promise<MPJourney[]> {
  await requireFeatureAccess("admin");
  const mp = new MPHelper();
  return mp.getTableRecords<MPJourney>({
    table: "Journeys",
    select: "Journey_ID,Journey_Name,Description,Active",
    filter: "Active = 1",
    orderBy: "Journey_Name",
  });
}

export interface MPMilestone {
  Milestone_ID: number;
  Milestone_Title: string;
  Sort_Order: number | null;
  Discontinued: boolean;
}

export async function getJourneyMilestones(journeyId: number): Promise<MPMilestone[]> {
  await requireFeatureAccess("admin");
  if (!Number.isFinite(journeyId) || journeyId <= 0) {
    throw new Error("Invalid journey ID");
  }
  const mp = new MPHelper();
  return mp.getTableRecords<MPMilestone>({
    table: "Milestones",
    select: "Milestone_ID,Milestone_Title,Sort_Order,Discontinued",
    filter: `Journey_ID = ${journeyId} AND Discontinued = 0`,
    orderBy: "Sort_Order",
  });
}

export interface MPProgram {
  Program_ID: number;
  Program_Name: string;
}

export async function getAvailablePrograms(): Promise<MPProgram[]> {
  await requireFeatureAccess("admin");
  const mp = new MPHelper();
  return mp.getTableRecords<MPProgram>({
    table: "Programs",
    select: "Program_ID,Program_Name",
    filter: "End_Date IS NULL",
    orderBy: "Program_Name",
  });
}

export interface MPGroup {
  Group_ID: number;
  Group_Name: string;
}

export async function getAvailableGroups(search?: string): Promise<MPGroup[]> {
  await requireFeatureAccess("admin");
  const mp = new MPHelper();
  let filter = "End_Date IS NULL";
  if (search && search.trim()) {
    filter += ` AND Group_Name LIKE '%${sanitizeFilterValue(search)}%'`;
  }
  return mp.getTableRecords<MPGroup>({
    table: "Groups",
    select: "Group_ID,Group_Name",
    filter,
    orderBy: "Group_Name",
    top: 50,
  });
}

export interface MPGroupRole {
  Group_Role_ID: number;
  Role_Title: string;
}

export async function getAvailableGroupRoles(): Promise<MPGroupRole[]> {
  await requireFeatureAccess("admin");
  const mp = new MPHelper();
  return mp.getTableRecords<MPGroupRole>({
    table: "Group_Roles",
    select: "Group_Role_ID,Role_Title",
    orderBy: "Role_Title",
  });
}

// ---------------------------------------------------------------------------
// Journey Tool Config CRUD
// ---------------------------------------------------------------------------

export async function getJourneyToolsConfigAction(): Promise<JourneyToolsConfig> {
  await requireFeatureAccess("admin");
  return loadJourneyToolsConfig();
}

export async function saveJourneyToolAction(
  tool: JourneyToolConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireFeatureAccess("admin");

    // Validate with Zod
    validateJourneyToolConfig(tool);

    const config = loadJourneyToolsConfig();
    const existingIndex = config.journeys.findIndex((j) => j.slug === tool.slug);

    if (existingIndex >= 0) {
      config.journeys[existingIndex] = tool;
    } else {
      config.journeys.push(tool);
    }

    saveJourneyToolsConfig(config);

    // Register in feature-access.json if not present
    if (tool.enabled) {
      const featureConfig = loadFeatureAccess();
      const featureKey = `journey:${tool.slug}`;
      if (!featureConfig[featureKey]) {
        featureConfig[featureKey] = {
          label: tool.journeyName,
          description: tool.description,
          allowedGroupIds: [],
        };
        saveFeatureAccess(featureConfig);
      }
    }

    // Clear service cache for this slug so it picks up new config
    JourneyProcessingService.clearCache(tool.slug);

    return { success: true };
  } catch (error) {
    console.error("Error saving journey tool:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to save journey tool" };
  }
}

export async function deleteJourneyToolAction(
  slug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireFeatureAccess("admin");

    const config = loadJourneyToolsConfig();
    config.journeys = config.journeys.filter((j) => j.slug !== slug);
    saveJourneyToolsConfig(config);

    // Remove from feature-access.json
    const featureConfig = loadFeatureAccess();
    const featureKey = `journey:${slug}`;
    if (featureConfig[featureKey]) {
      delete featureConfig[featureKey];
      saveFeatureAccess(featureConfig);
    }

    // Clear service cache
    JourneyProcessingService.clearCache(slug);

    return { success: true };
  } catch (error) {
    console.error("Error deleting journey tool:", error);
    return { success: false, error: "Failed to delete journey tool" };
  }
}
