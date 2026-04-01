import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"

export const findIntegrationMessenger = async (
  input: Partial<Pick<IntegrationMessengerModel, "id" | "chatbotId">>,
): Promise<IntegrationMessengerModel> =>
  findOrFail(integrationMessengerModel, input)

export const listIntegrationMessengers = async (
  input: Partial<Pick<IntegrationMessengerModel, "id" | "chatbotId">>,
): Promise<{ data: IntegrationMessengerModel[] }> => {
  const data = await db.query.integrationMessengerModel.findMany({
    where: input,
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
