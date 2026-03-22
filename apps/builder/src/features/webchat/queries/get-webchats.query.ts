"use server"

import { db, findOrFail, relationsFilterToSQL } from "@aha.chat/database/client"
import { integrationWebchatModel } from "@aha.chat/database/schema"
import type { IntegrationWebchatModel } from "@aha.chat/database/types"
import { parsePagination } from "@aha.chat/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetWebchatRequest } from "../schemas/webchat.schema"

export async function getIntegationWebchats(parsedInputs: GetWebchatRequest) {
  await assertCurrentUserCanAccessChatbot(parsedInputs.chatbotId)

  const where = {
    chatbotId: parsedInputs.chatbotId,
  }

  const pagination = parsePagination(parsedInputs)
  const [data, totalRows] = await Promise.all([
    db.query.integrationWebchatModel.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      ...pagination,
    }),
    pagination?.limit
      ? db.$count(
          integrationWebchatModel,
          relationsFilterToSQL(integrationWebchatModel, where),
        )
      : Promise.resolve(1),
  ])

  const pageCount = pagination?.limit
    ? Math.ceil(totalRows / pagination.limit)
    : 1
  return { data, pageCount }
}

export async function findIntegrationWebchat(
  where: Pick<IntegrationWebchatModel, "id" | "chatbotId">,
) {
  return await findOrFail<IntegrationWebchatModel>(
    integrationWebchatModel,
    where,
    "Integration webchat not found",
  )
}
