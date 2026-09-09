import { telegramIntegrationService } from "@chatbotx.io/business"
import type { IntegrationTelegramModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listIntegrationTelegrams = async ({
  where,
}: {
  where: Partial<Pick<IntegrationTelegramModel, "workspaceId">>
}): Promise<{ data: IntegrationTelegramModel[] }> => {
  const data = await telegramIntegrationService.listByWorkspaceId(where)

  return { data }
}

export const findIntegrationTelegram = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationTelegramModel | null> => {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return (
    (await telegramIntegrationService.findByWorkspaceId(workspaceId)) ?? null
  )
}

/** Internal lookup by botId — no auth check, for use in webhook handler only */
export const findIntegrationTelegramByBotId = async ({
  botId,
}: {
  botId: string
}): Promise<IntegrationTelegramModel | null> =>
  (await telegramIntegrationService.findByBotId(botId)) ?? null
