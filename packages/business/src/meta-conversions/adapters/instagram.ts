import { integrationInstagramRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"
import { resolveCapiAccessToken } from "../token"
import type { CapiReadinessAdapter } from "./types"

const instagramAuthForCapiSchema = z.object({
  tokens: z.object({
    accessToken: z.string().min(1),
  }),
})

function assertFacebookLoginIntegration(input: {
  type: "instagram" | "facebook"
}) {
  if (input.type === "instagram") {
    throw new Error(
      "Instagram Business Login integrations do not support Meta CAPI",
    )
  }
}

export const instagramCapiReadinessAdapter: CapiReadinessAdapter<"instagram"> =
  {
    assertSupported: assertFacebookLoginIntegration,
    async buildDatasetProvisionInput(integration) {
      assertFacebookLoginIntegration(integration)
      const auth = await resolveCapiAccessToken(integration)

      return {
        accessToken: auth.accessToken,
        resourceId: integration.igId,
      }
    },
    buildScopeCheckInput(integration) {
      assertFacebookLoginIntegration(integration)
      const auth = instagramAuthForCapiSchema.parse(integration.auth)

      return {
        accessToken: auth.tokens.accessToken,
        resourceId: integration.igId,
      }
    },
    claimCapiScopeCacheRefresh: (input, tx) =>
      integrationInstagramRepository.claimCapiScopeCacheRefresh(input, tx),
    findWorkspaceIntegration: (input, tx) =>
      integrationInstagramRepository.findWorkspaceIntegration(input, tx),
    updateCapiScopeCache: (input, tx) =>
      integrationInstagramRepository.updateCapiScopeCache(input, tx),
    updateDatasetIdIfNull: (input, tx) =>
      integrationInstagramRepository.updateDatasetIdIfNull(input, tx),
    updateDatasetId: (input, tx) =>
      integrationInstagramRepository.updateDatasetId(input, tx),
    updateCapiAccessToken: (input, tx) =>
      integrationInstagramRepository.updateCapiAccessToken(input, tx),
    connectCustomCapi: (input, tx) =>
      integrationInstagramRepository.connectCustomCapi(input, tx),
    clearCapiDisconnectedAt: (input, tx) =>
      integrationInstagramRepository.clearCapiDisconnectedAt(input, tx),
    setCapiDisconnectedAt: (input, tx) =>
      integrationInstagramRepository.setCapiDisconnectedAt(input, tx),
    clearCapiAccessToken: (input, tx) =>
      integrationInstagramRepository.clearCapiAccessToken(input, tx),
  } satisfies CapiReadinessAdapter<"instagram">
