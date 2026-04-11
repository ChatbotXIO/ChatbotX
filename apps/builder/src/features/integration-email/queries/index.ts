"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationEmailModel } from "@chatbotx.io/database/schema"
import type { IntegrationEmailModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const findIntegrationEmail = async (
  input: Partial<Pick<IntegrationEmailModel, "id" | "workspaceId">>,
): Promise<IntegrationEmailModel> =>
  findOrFail({ table: integrationEmailModel, where: input })

export const listIntegrationEmails = async (input: {
  workspaceId: string
}): Promise<{ data: IntegrationEmailModel[] }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.integrationEmailModel.findMany({
    where: {
      workspaceId: input.workspaceId,
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  return { data }
}
