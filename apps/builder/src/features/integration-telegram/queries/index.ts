import { db } from "@aha.chat/database/client"
import type { IntegrationTelegramModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listIntegrationTelegram = async ({
  where,
}: {
  where: { chatbotId?: string; id?: string }
}): Promise<{ data: IntegrationTelegramModel[] }> => {
  const data = await db.query.integrationTelegramModel.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}

export const findIntegrationTelegram = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationTelegramModel | null> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  return (
    (await db.query.integrationTelegramModel.findFirst({
      where: { chatbotId },
    })) ?? null
  )
}

/** Internal lookup by botId — no auth check, for use in webhook handler only */
export const findIntegrationTelegramByBotId = async ({
  botId,
}: {
  botId: string
}): Promise<IntegrationTelegramModel | null> => {
  return (
    (await db.query.integrationTelegramModel.findFirst({
      where: { botId },
    })) ?? null
  )
}
