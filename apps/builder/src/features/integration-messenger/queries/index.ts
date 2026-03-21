import { db } from "@chatbotx.io/database/client"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"

export const findIntegrationMessenger = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationMessengerModel | null> =>
  (await db.query.integrationMessengerModel.findFirst({
    where: {
      chatbotId,
    },
  })) ?? null
