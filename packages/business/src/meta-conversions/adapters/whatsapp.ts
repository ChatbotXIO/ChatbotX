import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"
import { resolveCapiAccessToken } from "../token"
import type { CapiReadinessAdapter } from "./types"

const whatsappAuthForCapiSchema = z.object({
  tokens: z.object({
    accessToken: z.string().min(1),
  }),
})

/**
 * WhatsApp implements the full send + connect intersection (v1.7 — Custom
 * connection + Disconnect, mirroring messenger/instagram exactly).
 * Readiness (scope + dataset) still also comes from the existing CTWA
 * connection (embedded signup / reconnect already set `hasCapiScope` +
 * auto-provision `datasetId`) for the OAuth path, but a workspace can now
 * also connect a manual Dataset ID + Access Token pair, and disconnect it.
 */
export const whatsappCapiReadinessAdapter: CapiReadinessAdapter<"whatsapp"> = {
  assertSupported() {
    // Every WhatsApp integration row supports Meta CAPI, subject to the
    // whatsapp_business_manage_events scope (checked separately by the
    // worker's scope checker).
  },
  async buildDatasetProvisionInput(integration) {
    const auth = await resolveCapiAccessToken(integration)

    return {
      accessToken: auth.accessToken,
      resourceId: integration.wabaId,
    }
  },
  buildScopeCheckInput(integration) {
    const auth = whatsappAuthForCapiSchema.parse(integration.auth)

    return {
      accessToken: auth.tokens.accessToken,
      resourceId: integration.wabaId,
    }
  },
  claimCapiScopeCacheRefresh: (input, tx) =>
    integrationWhatsappRepository.claimCapiScopeCacheRefresh(input, tx),
  findWorkspaceIntegration: (input, tx) =>
    integrationWhatsappRepository.findByIdForWorkspace(input, tx),
  updateCapiScopeCache: (input, tx) =>
    integrationWhatsappRepository.updateCapiScopeCache(input, tx),
  updateDatasetId: (input, tx) =>
    integrationWhatsappRepository.updateDatasetId(input, tx),
  updateDatasetIdIfNull: (input, tx) =>
    integrationWhatsappRepository.updateDatasetIdIfNull(input, tx),
  updateCapiAccessToken: (input, tx) =>
    integrationWhatsappRepository.updateCapiAccessToken(input, tx),
  connectCustomCapi: (input, tx) =>
    integrationWhatsappRepository.connectCustomCapi(input, tx),
  clearCapiDisconnectedAt: (input, tx) =>
    integrationWhatsappRepository.clearCapiDisconnectedAt(input, tx),
  setCapiDisconnectedAt: (input, tx) =>
    integrationWhatsappRepository.setCapiDisconnectedAt(input, tx),
  clearCapiAccessToken: (input, tx) =>
    integrationWhatsappRepository.clearCapiAccessToken(input, tx),
} satisfies CapiReadinessAdapter<"whatsapp">
