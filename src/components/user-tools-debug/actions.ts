"use server";

import { requireSession, getMpUserId } from "@/lib/auth-helpers";
import { ToolService } from "@/services/toolService";

export async function getUserTools(): Promise<string[]> {
  const session = await requireSession();
  const userId = getMpUserId(session);

  if (!userId) {
    throw new Error("Unauthorized - Missing user User_ID");
  }

  const toolService = await ToolService.getInstance();
  const toolPaths = await toolService.getUserTools(1, userId);

  return toolPaths;
}
