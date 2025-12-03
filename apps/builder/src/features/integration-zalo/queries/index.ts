import { prisma } from "@aha.chat/database"
import type { IntegrationZaloModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const findIntegrationZalo = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationZaloModel | null> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  return await prisma.integrationZalo.findFirst({
    where: {
      chatbotId,
    },
  })
}
