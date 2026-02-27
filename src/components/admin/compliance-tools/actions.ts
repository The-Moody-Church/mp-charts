"use server";

import { requireFeatureAccess, loadFeatureAccess, saveFeatureAccess } from "@/lib/authorization";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeIds } from "@/lib/providers/ministry-platform/utils/filter-sanitize";
import {
  loadComplianceToolsConfig,
  saveComplianceToolsConfig,
  validateComplianceToolConfig,
  type ComplianceToolConfig,
  type ComplianceToolsConfig,
} from "@/lib/compliance-tools-config";
import { ComplianceProcessingService } from "@/services/complianceProcessingService";

// ---------------------------------------------------------------------------
// MP Data Queries (reuse journey admin actions where possible)
// ---------------------------------------------------------------------------

export interface MPParticipationRequirement {
  Participation_Requirement_ID: number;
  Requirement_Name: string;
  Requirement_Type: string;
  Group_Role_ID: number;
  Sort_Order: number | null;
}

export async function getGroupRoleRequirements(groupRoleIds: number[]): Promise<MPParticipationRequirement[]> {
  await requireFeatureAccess("admin");
  if (groupRoleIds.length === 0) return [];
  const mp = new MPHelper();
  return mp.getTableRecords<MPParticipationRequirement>({
    table: "Participation_Requirements",
    select: "Participation_Requirement_ID,Requirement_Name,Requirement_Type,Group_Role_ID,Sort_Order",
    filter: `Group_Role_ID IN (${sanitizeIds(groupRoleIds)})`,
    orderBy: "Sort_Order,Requirement_Name",
  });
}

// ---------------------------------------------------------------------------
// Compliance Tool Config CRUD
// ---------------------------------------------------------------------------

export async function getComplianceToolsConfigAction(): Promise<ComplianceToolsConfig> {
  await requireFeatureAccess("admin");
  return loadComplianceToolsConfig();
}

export async function saveComplianceToolAction(
  tool: ComplianceToolConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireFeatureAccess("admin");

    // Validate with Zod
    validateComplianceToolConfig(tool);

    const config = loadComplianceToolsConfig();
    const existingIndex = config.tools.findIndex((t) => t.slug === tool.slug);

    if (existingIndex >= 0) {
      config.tools[existingIndex] = tool;
    } else {
      config.tools.push(tool);
    }

    saveComplianceToolsConfig(config);

    // Register in feature-access.json if not present
    if (tool.enabled) {
      const featureConfig = loadFeatureAccess();
      const featureKey = `compliance:${tool.slug}`;
      if (!featureConfig[featureKey]) {
        featureConfig[featureKey] = {
          label: tool.toolName,
          description: tool.description,
          allowedGroupIds: [],
        };
        saveFeatureAccess(featureConfig);
      }
    }

    // Clear service cache for this slug so it picks up new config
    ComplianceProcessingService.clearCache(tool.slug);

    return { success: true };
  } catch (error) {
    console.error("Error saving compliance tool:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to save compliance tool" };
  }
}

export async function deleteComplianceToolAction(
  slug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireFeatureAccess("admin");

    const config = loadComplianceToolsConfig();
    config.tools = config.tools.filter((t) => t.slug !== slug);
    saveComplianceToolsConfig(config);

    // Remove from feature-access.json
    const featureConfig = loadFeatureAccess();
    const featureKey = `compliance:${slug}`;
    if (featureConfig[featureKey]) {
      delete featureConfig[featureKey];
      saveFeatureAccess(featureConfig);
    }

    // Clear service cache
    ComplianceProcessingService.clearCache(slug);

    return { success: true };
  } catch (error) {
    console.error("Error deleting compliance tool:", error);
    return { success: false, error: "Failed to delete compliance tool" };
  }
}
