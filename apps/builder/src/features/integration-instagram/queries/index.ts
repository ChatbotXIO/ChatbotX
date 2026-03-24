import { db, findOrFail } from "@aha.chat/database/client"
import { integrationInstagramModel } from "@aha.chat/database/schema"
import type { IntegrationInstagramModel } from "@aha.chat/database/types"

export const findIntegrationInstagram = async ({
  id,
}: {
  id: string
}): Promise<IntegrationInstagramModel> =>
  findOrFail(integrationInstagramModel, {
    id,
  })

export const listIntegrationInstagrams = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{ data: IntegrationInstagramModel[] }> => {
  const data = await db.query.integrationInstagramModel.findMany({
    where: {
      chatbotId,
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
