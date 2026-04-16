import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"

export const findIntegrationInstagram = async (where: {
  workspaceId: string
  id: string
}): Promise<IntegrationInstagramModel> =>
  findOrFail({
    table: integrationInstagramModel,
    where,
  })

export const listIntegrationInstagrams = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<{ data: IntegrationInstagramModel[] }> => {
  const data = await db.query.integrationInstagramModel.findMany({
    where: {
      workspaceId,
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
