import { integrationMessengerRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"
import { resolveCapiAccessToken } from "../token"
import type { CapiReadinessAdapter } from "./types"

const messengerAuthForCapiSchema = z.object({
  tokens: z.object({
    accessToken: z.string().min(1),
  }),
})

export const messengerCapiReadinessAdapter: CapiReadinessAdapter<"messenger"> =
  {
    assertSupported() {
      // Messenger rows are always Facebook-login rows in this schema.
    },
    async buildDatasetProvisionInput(integration) {
      const auth = await resolveCapiAccessToken(integration)

      return {
        accessToken: auth.accessToken,
        resourceId: integration.pageId,
      }
    },
    buildScopeCheckInput(integration) {
      const auth = messengerAuthForCapiSchema.parse(integration.auth)

      return {
        accessToken: auth.tokens.accessToken,
        resourceId: integration.pageId,
      }
    },
    claimCapiScopeCacheRefresh: (input, tx) =>
      integrationMessengerRepository.claimCapiScopeCacheRefresh(input, tx),
    findWorkspaceIntegration: (input, tx) =>
      integrationMessengerRepository.findWorkspaceIntegration(input, tx),
    updateCapiScopeCache: (input, tx) =>
      integrationMessengerRepository.updateCapiScopeCache(input, tx),
    updateDatasetIdIfNull: (input, tx) =>
      integrationMessengerRepository.updateDatasetIdIfNull(input, tx),
    updateDatasetId: (input, tx) =>
      integrationMessengerRepository.updateDatasetId(input, tx),
    updateCapiAccessToken: (input, tx) =>
      integrationMessengerRepository.updateCapiAccessToken(input, tx),
    connectCustomCapi: (input, tx) =>
      integrationMessengerRepository.connectCustomCapi(input, tx),
    clearCapiDisconnectedAt: (input, tx) =>
      integrationMessengerRepository.clearCapiDisconnectedAt(input, tx),
    setCapiDisconnectedAt: (input, tx) =>
      integrationMessengerRepository.setCapiDisconnectedAt(input, tx),
    clearCapiAccessToken: (input, tx) =>
      integrationMessengerRepository.clearCapiAccessToken(input, tx),
  } satisfies CapiReadinessAdapter<"messenger">
