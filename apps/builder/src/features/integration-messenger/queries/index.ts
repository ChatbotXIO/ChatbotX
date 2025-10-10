import { prisma } from "@aha.chat/database"
import type { IntegrationMessengerModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"

export const findIntegrationMessenger = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationMessengerModel | null> =>
  await unstable_cache(
    async () =>
      await prisma.integrationMessenger.findFirst({
        where: {
          chatbotId,
        },
      }),
    [`chatbots:${chatbotId}#messenger`],
    {
      revalidate: 3600,
      tags: [`chatbots:${chatbotId}#messenger`],
    },
  )()
