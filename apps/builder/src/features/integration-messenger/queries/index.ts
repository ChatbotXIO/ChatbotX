import { db } from "@aha.chat/database/client"
import type { IntegrationMessengerModel } from "@aha.chat/database/types"

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
