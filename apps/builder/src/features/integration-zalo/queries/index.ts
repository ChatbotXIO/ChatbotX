import { db } from "@aha.chat/database/client"
import type { IntegrationZaloModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const findIntegrationZalo = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationZaloModel | null> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  return (
    (await db.query.integrationZaloModel.findFirst({
      where: {
        chatbotId,
      },
    })) ?? null
  )
}
