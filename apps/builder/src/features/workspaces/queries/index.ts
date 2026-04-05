"use server"

import { db } from "@chatbotx.io/database/client"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { notFoundException } from "@/lib/errors/exception"

export const findChatbotOrFail = async (
  where: Record<string, unknown>,
): Promise<WorkspaceModel> => {
  const workspace = await db.query.workspaceModel.findFirst({
    where,
  })
  if (!workspace) {
    throw notFoundException("Workspace not found")
  }
  return workspace
}
