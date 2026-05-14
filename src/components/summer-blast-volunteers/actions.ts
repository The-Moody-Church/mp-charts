"use server";

import { updateTag } from "next/cache";
import { getMpUserId } from "@/lib/auth-helpers";
import { requireFeatureAccess } from "@/lib/authorization";
import { enforceRateLimit } from "@/lib/rate-limit";
import { serviceCache } from "@/lib/service-cache";
import { SummerBlastService } from "@/services/summerBlastService";
import {
  getCachedSummerBlastIntake,
  getCachedSummerBlastVolunteers,
  SUMMER_BLAST_INTAKE_TAG,
  SUMMER_BLAST_VOLUNTEERS_TAG,
} from "./cached-data";
import type {
  SummerBlastIntakeCard,
  SummerBlastVolunteerCard,
} from "@/lib/dto";

const FEATURE = "summer-blast-volunteers" as const;

function invalidateAll() {
  // updateTag invalidates the Next.js 'use cache' framework cache; serviceCache
  // is our in-memory safety net inside each cached function and must be cleared
  // separately or it will keep returning the pre-write snapshot.
  updateTag(SUMMER_BLAST_INTAKE_TAG);
  updateTag(SUMMER_BLAST_VOLUNTEERS_TAG);
  serviceCache.deleteByPrefix(SUMMER_BLAST_INTAKE_TAG);
  serviceCache.deleteByPrefix(SUMMER_BLAST_VOLUNTEERS_TAG);
}

export async function getSummerBlastIntake(): Promise<SummerBlastIntakeCard[]> {
  await requireFeatureAccess(FEATURE);
  try {
    return await getCachedSummerBlastIntake();
  } catch (error) {
    console.error("Error fetching Summer Blast intake:", error);
    throw new Error("Failed to load Summer Blast intake");
  }
}

export async function getSummerBlastVolunteers(): Promise<SummerBlastVolunteerCard[]> {
  await requireFeatureAccess(FEATURE);
  try {
    return await getCachedSummerBlastVolunteers();
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

    invalidateAll();
    return { success: true };
  } catch (error) {
    console.error("Error adding to Summer Blast:", error);
    return { success: false, error: "Failed to add to Summer Blast" };
  }
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

    invalidateAll();
    return { success: true };
  } catch (error) {
    console.error("Error removing from Summer Blast:", error);
    return { success: false, error: "Failed to remove from Summer Blast" };
  }
}

