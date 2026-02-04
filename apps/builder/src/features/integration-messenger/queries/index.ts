import { db, findOrFail } from "@aha.chat/database/client"
import { integrationMessengerModel } from "@aha.chat/database/schema"
import type { IntegrationMessengerModel } from "@aha.chat/database/types"

export const findIntegrationMessenger = async ({
  id,
}: {
  id: string
}): Promise<IntegrationMessengerModel> =>
  findOrFail(integrationMessengerModel, {
    id,
  })

export const listIntegrationMessengers = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{ data: IntegrationMessengerModel[] }> => {
  const data = await db.query.integrationMessengerModel.findMany({
    where: {
      chatbotId,
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
