"use server"

import {
  db,
  findOrFail,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { integrationWebchatModel } from "@chatbotx.io/database/schema"
import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import { parsePagination } from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListIntegrationWebchatsRequest } from "../schema/query"

export const listIntegrationWebchats = async (
  input: ListIntegrationWebchatsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
  }

  const pagination = parsePagination(input)
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
  where: Pick<IntegrationWebchatModel, "id" | "workspaceId">,
) {
  return await findOrFail({
    table: integrationWebchatModel,
    where,
    message: "Integration webchat not found",
  })
}
