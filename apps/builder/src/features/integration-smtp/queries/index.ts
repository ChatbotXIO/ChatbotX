"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationSmtpModel } from "@chatbotx.io/database/schema"
import type { IntegrationSmtpModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const findIntegrationSmtp = async (
  input: Partial<Pick<IntegrationSmtpModel, "id" | "workspaceId">>,
): Promise<IntegrationSmtpModel> =>
  findOrFail({ table: integrationSmtpModel, where: input })

export const listIntegrationSmtps = async (input: {
  workspaceId: string
}): Promise<{ data: IntegrationSmtpModel[] }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.integrationSmtpModel.findMany({
    where: {
      workspaceId: input.workspaceId,
    },
    orderBy: {
      createdAt: "desc",
    },
    limit: 1,
  })

  return { data }
}
