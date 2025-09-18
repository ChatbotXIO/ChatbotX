import { prisma } from "@aha.chat/database"
import type { IntegrationZaloModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"

export const findIntegrationZalo = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationZaloModel | null> => {
  return await unstable_cache(
    async () => {
      return await prisma.integrationZalo.findFirst({
        where: {
          chatbotId,
        },
      })
    },
    [`chatbots:${chatbotId}#zalo`],
    {
      revalidate: 3600,
      tags: [`chatbots:${chatbotId}#zalo`],
    },
  )()
}
