"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationMuseService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectMuseAction = createDisconnectAction(
  integrationMuseService,
  {
    name: "Muse",
    provider: "muse",
    log: false,
    afterDisconnect: async (workspaceId) => {
      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.muse,
      )
    },
  },
)
