"use server";

import { requireFeatureAccess, loadFeatureAccess, saveFeatureAccess } from "@/lib/authorization";
import { MPHelper } from "@/lib/providers/ministry-platform";
import { sanitizeIds } from "@/lib/providers/ministry-platform/utils/filter-sanitize";
import { z } from "zod";
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

/** Resolved, deduplicated requirement ready for the editor. */
export interface ResolvedRequirement {
  /** The actual entity ID (Certification_Type_ID, Form_ID, Milestone_ID, or Background_Check_Type_ID) */
  requirementId: number;
  label: string;
  type: "background_check" | "certification" | "milestone" | "form";
}

/**
 * Fetch participation requirements for the given group roles, deduplicate by
 * the linked entity (form, certification type, milestone, or background check type),
 * and resolve names from the corresponding MP tables.
 */
export async function getDeduplicatedRequirements(groupRoleIds: number[]): Promise<ResolvedRequirement[]> {
  await requireFeatureAccess("admin");
  if (groupRoleIds.length === 0) return [];
  const mp = new MPHelper();

  // 1. Fetch raw participation requirements + check Background_Check_Required on roles
  const [raw, roles] = await Promise.all([
    mp.getTableRecords<{
      Background_Check_Type_ID: number | null;
      Certification_Type_ID: number | null;
      Milestone_ID: number | null;
      Custom_Form_ID: number | null;
    }>({
      table: "Participation_Requirements",
      select: "Background_Check_Type_ID,Certification_Type_ID,Milestone_ID,Custom_Form_ID",
      filter: `Group_Role_ID IN (${sanitizeIds(groupRoleIds)})`,
    }),
    mp.getTableRecords<{ Group_Role_ID: number; Background_Check_Required: boolean }>({
      table: "Group_Roles",
      select: "Group_Role_ID,Background_Check_Required",
      filter: `Group_Role_ID IN (${sanitizeIds(groupRoleIds)})`,
    }),
  ]);

  const bgCheckRequired = roles.some(r => r.Background_Check_Required);

  // 2. Collect unique entity IDs by type
  const bgIds = new Set<number>();
  const certIds = new Set<number>();
  const milestoneIds = new Set<number>();
  const formIds = new Set<number>();

  for (const r of raw) {
    if (r.Background_Check_Type_ID) bgIds.add(r.Background_Check_Type_ID);
    else if (r.Certification_Type_ID) certIds.add(r.Certification_Type_ID);
    else if (r.Milestone_ID) milestoneIds.add(r.Milestone_ID);
    else if (r.Custom_Form_ID) formIds.add(r.Custom_Form_ID);
  }

  // 3. Resolve names in parallel (only fetch specific BG check types, not all)
  const [bgTypes, certTypes, milestones, forms] = await Promise.all([
    bgIds.size > 0
      ? mp.getTableRecords<{ Background_Check_Type_ID: number; Background_Check_Type: string }>({
          table: "Background_Check_Types",
          select: "Background_Check_Type_ID,Background_Check_Type",
          filter: `Background_Check_Type_ID IN (${sanitizeIds([...bgIds])})`,
        })
      : [],
    certIds.size > 0
      ? mp.getTableRecords<{ Certification_Type_ID: number; Certification_Type: string }>({
          table: "Certification_Types",
          select: "Certification_Type_ID,Certification_Type",
          filter: `Certification_Type_ID IN (${sanitizeIds([...certIds])})`,
        })
      : [],
    milestoneIds.size > 0
      ? mp.getTableRecords<{ Milestone_ID: number; Milestone_Title: string }>({
          table: "Milestones",
          select: "Milestone_ID,Milestone_Title",
          filter: `Milestone_ID IN (${sanitizeIds([...milestoneIds])})`,
        })
      : [],
    formIds.size > 0
      ? mp.getTableRecords<{ Form_ID: number; Form_Title: string }>({
          table: "Forms",
          select: "Form_ID,Form_Title",
          filter: `Form_ID IN (${sanitizeIds([...formIds])})`,
        })
      : [],
  ]);

  // 4. Build deduplicated results
  const results: ResolvedRequirement[] = [];

  if (bgTypes.length > 0) {
    // Specific BG check types from participation requirements — use those
    for (const bg of bgTypes) {
      results.push({ requirementId: bg.Background_Check_Type_ID, label: bg.Background_Check_Type, type: "background_check" });
    }
  } else if (bgCheckRequired) {
    // Generic "Background Check Required" on role — single generic entry (ID 0)
    results.push({ requirementId: 0, label: "Background Check", type: "background_check" });
  }
  for (const cert of certTypes) {
    results.push({ requirementId: cert.Certification_Type_ID, label: cert.Certification_Type, type: "certification" });
  }
  for (const m of milestones) {
    results.push({ requirementId: m.Milestone_ID, label: m.Milestone_Title, type: "milestone" });
  }
  for (const f of forms) {
    results.push({ requirementId: f.Form_ID, label: f.Form_Title, type: "form" });
  }

  results.sort((a, b) => a.label.localeCompare(b.label));
  return results;
}

// ---------------------------------------------------------------------------
// Compliance Tool Config CRUD
// ---------------------------------------------------------------------------

export async function getComplianceToolsConfigAction(): Promise<ComplianceToolsConfig> {
  await requireFeatureAccess("admin");
  return loadComplianceToolsConfig();
}

export async function saveComplianceToolAction(
  tool: ComplianceToolConfig,
  isNew?: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireFeatureAccess("admin");

    // Validate with Zod
    validateComplianceToolConfig(tool);

    const config = loadComplianceToolsConfig();
    const existingIndex = config.tools.findIndex((t) => t.slug === tool.slug);

    if (isNew && existingIndex >= 0) {
      return { success: false, error: "slug: A tool with this slug already exists." };
    }

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
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((i) => {
        const field = i.path.length > 0 ? i.path.join(".") : "config";
        return `${field}: ${i.message}`;
      });
      return { success: false, error: messages.join("; ") };
    }
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
