import { telegramIntegrationService } from "@chatbotx.io/business"
import type { IntegrationTelegramModel } from "@chatbotx.io/database/types"

export const listIntegrationTelegrams = async ({
  where,
}: {
  where: Partial<Pick<IntegrationTelegramModel, "workspaceId">>
}): Promise<{ data: IntegrationTelegramModel[] }> => {
  const data = await telegramIntegrationService.listByWorkspace(where)

  return { data }
}

/** Internal lookup by botId — no auth check, for use in webhook handler only */
export const findIntegrationTelegramByBotId = async ({
  botId,
}: {
  botId: string
}): Promise<IntegrationTelegramModel | null> =>
  await telegramIntegrationService.findByBotId(botId)
