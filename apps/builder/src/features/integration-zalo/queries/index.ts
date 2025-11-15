import { prisma } from "@aha.chat/database"
import type { IntegrationZaloModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { calcCacheTags } from "@/lib/cache-helper"

export const findIntegrationZalo = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationZaloModel | null> =>
  await unstable_cache(
    async () =>
      await prisma.integrationZalo.findFirst({
        where: {
          chatbotId,
        },
      }),
    [`chatbots:${chatbotId}#zalos`],
    calcCacheTags(`chatbots:${chatbotId}#zalos`),
  )()
