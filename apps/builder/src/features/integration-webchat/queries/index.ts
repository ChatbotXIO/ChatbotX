"use server"

import { integrationWebchatService } from "@chatbotx.io/business"
import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { parsePagination } from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListIntegrationWebchatsRequest } from "../schema/query"

export const listIntegrationWebchats = async (
  input: ListIntegrationWebchatsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const pagination = parsePagination(input)
  const [data, totalRows] = await integrationWebchatService.listByWorkspaceId({
    workspaceId: input.workspaceId,
    pagination,
  })

  const pageCount = pagination?.limit
    ? Math.ceil(totalRows / pagination.limit)
    : 1
  return { data, pageCount }
}

export async function findIntegrationWebchat(
  where: Pick<IntegrationWebchatModel, "id" | "workspaceId">,
) {
  return await integrationWebchatService.findByWorkspaceIdAndId(where)
}
