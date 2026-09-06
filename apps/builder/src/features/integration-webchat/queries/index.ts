"use server"

import { integrationWebchatService } from "@chatbotx.io/business"
import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListIntegrationWebchatsRequest } from "../schema/query"

export const listIntegrationWebchats = async (
  input: ListIntegrationWebchatsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await integrationWebchatService.list({
    workspaceId: input.workspaceId,
    page: input.page,
    perPage: input.perPage,
  })
}

export async function findIntegrationWebchat(
  where: Pick<IntegrationWebchatModel, "id" | "workspaceId">,
) {
  return await integrationWebchatService.findByIdForWorkspace({
    id: where.id,
    workspaceId: where.workspaceId,
  })
}
