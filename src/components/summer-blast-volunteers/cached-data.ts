// Cached data layer for the Summer Blast Volunteers feature.
//
// NOTE: If you add a new 'use cache' function here, you MUST register it in
// src/lib/cache-warming.ts so it is pre-warmed on container start.
// See the "Cache Warming" section in CLAUDE.md.

import { cacheLife, cacheTag } from "next/cache";
import { SummerBlastService } from "@/services/summerBlastService";
import { serviceCache, CACHE_TTL } from "@/lib/service-cache";
import type {
  SummerBlastIntakeCard,
  SummerBlastVolunteerCard,
} from "@/lib/dto";

export const SUMMER_BLAST_INTAKE_TAG = "summer-blast-intake";
export const SUMMER_BLAST_VOLUNTEERS_TAG = "summer-blast-volunteers";

export async function getCachedSummerBlastIntake(): Promise<SummerBlastIntakeCard[]> {
  "use cache";
  cacheLife({ revalidate: 21600, stale: 86400 });
  cacheTag(SUMMER_BLAST_INTAKE_TAG);

  return serviceCache.getOrFetch(SUMMER_BLAST_INTAKE_TAG, CACHE_TTL.STANDARD, async () => {
    const service = SummerBlastService.getInstance();
    return service.getIntakeCards();
  });
}

export async function getCachedSummerBlastVolunteers(): Promise<SummerBlastVolunteerCard[]> {
  "use cache";
  cacheLife({ revalidate: 21600, stale: 86400 });
  cacheTag(SUMMER_BLAST_VOLUNTEERS_TAG);

  return serviceCache.getOrFetch(SUMMER_BLAST_VOLUNTEERS_TAG, CACHE_TTL.STANDARD, async () => {
    const service = SummerBlastService.getInstance();
    return service.getVolunteerCards();
  });
}
