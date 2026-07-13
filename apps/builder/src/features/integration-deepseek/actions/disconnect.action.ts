"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationDeepSeekService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectDeepSeekAction = createDisconnectAction(
  integrationDeepSeekService,
  {
    name: "DeepSeek",
    log: false,
    afterDisconnect: async (workspaceId) => {
      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.deepseek,
      )
    },
  },
)
