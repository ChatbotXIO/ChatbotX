import { prisma } from "@aha.chat/database"
import type { IntegrationMessengerModel } from "@aha.chat/database/types"

export const findIntegrationMessenger = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationMessengerModel | null> => {
  return await prisma.integrationMessenger.findFirst({
    where: {
      chatbotId,
    },
  })
}
