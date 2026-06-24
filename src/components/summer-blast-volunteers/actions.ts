"use server";

import { getMpUserId } from "@/lib/auth-helpers";
import { requireFeatureAccess } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SummerBlastService } from "@/services/summerBlastService";
import type {
  SummerBlastIntakeCard,
  SummerBlastVolunteerCard,
} from "@/lib/dto";

const FEATURE = "summer-blast-volunteers" as const;

export async function getSummerBlastIntake(): Promise<SummerBlastIntakeCard[]> {
  await requireFeatureAccess(FEATURE);
  try {
    return await SummerBlastService.getInstance().getIntakeCards();
  } catch (error) {
    console.error("Error fetching Summer Blast intake:", error);
    throw new Error("Failed to load Summer Blast intake");
  }
}

export async function getSummerBlastVolunteers(): Promise<SummerBlastVolunteerCard[]> {
  await requireFeatureAccess(FEATURE);
  try {
    return await SummerBlastService.getInstance().getVolunteerCards();
  } catch (error) {
    console.error("Error fetching Summer Blast volunteers:", error);
    throw new Error("Failed to load Summer Blast volunteers");
  }
}

export async function addToSummerBlast(formData: FormData): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await requireFeatureAccess(FEATURE);
    enforceRateLimit(session.user.id, "write");

    const contactId = Number(formData.get("Contact_ID"));
    const responseId = Number(formData.get("Response_ID"));
    const rawRole = formData.get("Group_Role_ID");
    const groupRoleId = rawRole && rawRole !== "" ? Number(rawRole) : null;

    if (!contactId || !responseId) {
      return { success: false, error: "Missing required fields" };
    }

    const service = SummerBlastService.getInstance();
    await service.addToSummerBlast({
      contactId,
      responseId,
      groupRoleId,
      userId: getMpUserId(session),
    });

    return { success: true };
  } catch (error) {
    console.error("Error adding to Summer Blast:", error);
    return { success: false, error: "Failed to add to Summer Blast" };
  }
}

export interface BulkAddResult {
  success: boolean;
  succeededCount: number;
  failures: { responseId: number; error: string }[];
}

/**
 * Maximum signups accepted in a single bulk-add call. The write rate-limit tier is
 * charged once per call, and each item performs 2 MP writes, so without this cap a
 * single request could trigger an unbounded burst of writes (F8). 100 comfortably
 * covers real batch sizes while bounding the per-call blast radius.
 */
const MAX_BULK_ITEMS = 100;

/**
 * Bulk-add multiple signups to Summer Blast as Temp role. Each signup is processed
 * individually so a single failure doesn't abort the batch.
 */
export async function bulkAddToSummerBlast(
  items: { contactId: number; responseId: number }[],
): Promise<BulkAddResult> {
  const session = await requireFeatureAccess(FEATURE);
  enforceRateLimit(session.user.id, "write");

  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, succeededCount: 0, failures: [] };
  }

  // F8: bound the batch size so one call can't drive an unbounded number of writes.
  if (items.length > MAX_BULK_ITEMS) {
    return {
      success: false,
      succeededCount: 0,
      failures: [{ responseId: 0, error: `Too many items in one request (max ${MAX_BULK_ITEMS})` }],
    };
  }

  const service = SummerBlastService.getInstance();
  const userId = getMpUserId(session);
  const failures: { responseId: number; error: string }[] = [];
  let succeededCount = 0;

  for (const item of items) {
    const contactId = Number(item.contactId);
    const responseId = Number(item.responseId);
    // Require positive integers (service also re-validates via sanitizeId before any filter use).
    if (!Number.isInteger(contactId) || contactId <= 0 || !Number.isInteger(responseId) || responseId <= 0) {
      failures.push({ responseId: Number.isInteger(responseId) && responseId > 0 ? responseId : 0, error: "Invalid or missing IDs" });
      continue;
    }
    try {
      await service.addToSummerBlast({
        contactId,
        responseId,
        groupRoleId: null,
        userId,
      });
      succeededCount += 1;
    } catch (error) {
      console.error("Error adding to Summer Blast (bulk):", error);
      failures.push({
        responseId,
        error: error instanceof Error ? error.message : "Failed to add",
      });
    }
  }

  return { success: failures.length === 0, succeededCount, failures };
}

export async function removeFromSummerBlast(formData: FormData): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const session = await requireFeatureAccess(FEATURE);
    enforceRateLimit(session.user.id, "write");

    const groupParticipantId = Number(formData.get("Group_Participant_ID"));
    if (!groupParticipantId) {
      return { success: false, error: "Missing required fields" };
    }

    const service = SummerBlastService.getInstance();
    await service.removeFromSummerBlast({
      groupParticipantId,
      userId: getMpUserId(session),
    });

    return { success: true };
  } catch (error) {
    console.error("Error removing from Summer Blast:", error);
    return { success: false, error: "Failed to remove from Summer Blast" };
  }
}

