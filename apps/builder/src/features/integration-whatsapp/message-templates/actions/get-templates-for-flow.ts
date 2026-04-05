"use server"

import { getTemplatesForChatbot } from "../queries"

export async function getTemplatesForFlow(workspaceId: string) {
  return await getTemplatesForChatbot(workspaceId, "APPROVED")
}
