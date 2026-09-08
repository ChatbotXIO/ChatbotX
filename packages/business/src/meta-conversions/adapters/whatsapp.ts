import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import { WHATSAPP_CAPI_SCOPE } from "../../integration-whatsapp/auth-schema"
import { integrationWhatsappService } from "../../integration-whatsapp/service"
import { whatsappBusinessAccountService } from "../../whatsapp-business-account/service"
import { resolveCapiAccessToken } from "../token"
import type { CapiReadinessAdapter } from "./types"

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
    const auth =
      await whatsappCapiReadinessAdapter.resolveCapiAccessToken(integration)
    // Embedded-signup connections create the dataset with the agency System
    // User token (Meta attributes the "Creator" to the business), falling back
    // to the connect token if that system user cannot create it. Manual
    // connections and missing credentials use the connect token with no
    // fallback.
    const { primaryToken, fallbackToken } =
      await integrationWhatsappService.resolveDatasetCreationTokens({
        integration,
        workspaceId: integration.workspaceId,
        connectToken: auth.accessToken,
      })

    return {
      accessToken: primaryToken,
      fallbackAccessToken: fallbackToken,
      resourceId: integration.wabaId,
      resourceName: integration.name,
    }
  },
  async buildScopeCheckInput(integration) {
    const auth =
      await whatsappCapiReadinessAdapter.resolveCapiAccessToken(integration)

    return {
      accessToken: auth.accessToken,
      resourceId: integration.wabaId,
    }
  },
  async resolveCapiAccessToken(integration) {
    return await resolveCapiAccessToken(integration, async () => {
      const waba = await whatsappBusinessAccountService.findDecryptedCredential(
        {
          workspaceId: integration.workspaceId,
          wabaId: integration.wabaId,
        },
      )
      return waba?.decryptedCredential.accessToken ?? null
    })
  },
  async resolveCapiScopeState(integration) {
    if (integration.capiAccessToken) {
      return integration
    }
    const waba = await whatsappBusinessAccountService.findByWaba({
      workspaceId: integration.workspaceId,
      wabaId: integration.wabaId,
    })
    return waba
      ? {
          hasCapiScope: waba.grantedScopes.includes(WHATSAPP_CAPI_SCOPE),
          capiScopeCheckedAt: waba.scopeCheckedAt,
        }
      : integration
  },
  async claimCapiScopeCacheRefresh(input, tx) {
    const { integration, ...claim } = input
    if (integration.capiAccessToken) {
      return tx
        ? await integrationWhatsappRepository.claimCapiScopeCacheRefresh(
            claim,
            tx,
          )
        : await integrationWhatsappRepository.claimCapiScopeCacheRefresh(claim)
    }

    const currentWaba = await whatsappBusinessAccountService.findByWaba({
      workspaceId: integration.workspaceId,
      wabaId: integration.wabaId,
      tx,
    })
    if (!currentWaba) {
      return tx
        ? await integrationWhatsappRepository.claimCapiScopeCacheRefresh(
            claim,
            tx,
          )
        : await integrationWhatsappRepository.claimCapiScopeCacheRefresh(claim)
    }

    const waba = await whatsappBusinessAccountService.claimScopeCacheRefresh({
      workspaceId: integration.workspaceId,
      wabaId: integration.wabaId,
      capiScopeCheckedAt: input.capiScopeCheckedAt,
      expectedCapiScopeCheckedAt: input.expectedCapiScopeCheckedAt,
      tx,
    })
    return waba
      ? {
          ...integration,
          hasCapiScope: waba.grantedScopes.includes(WHATSAPP_CAPI_SCOPE),
          capiScopeCheckedAt: waba.scopeCheckedAt,
        }
      : null
  },
  findWorkspaceIntegration: (input, tx) =>
    tx
      ? integrationWhatsappRepository.findByIdForWorkspace(input, tx)
      : integrationWhatsappRepository.findByIdForWorkspace(input),
  async updateCapiScopeCache(input, tx) {
    const integration =
      await whatsappCapiReadinessAdapter.findWorkspaceIntegration(input, tx)
    if (!integration || integration.capiAccessToken) {
      return tx
        ? await integrationWhatsappRepository.updateCapiScopeCache(input, tx)
        : await integrationWhatsappRepository.updateCapiScopeCache(input)
    }

    const waba = await whatsappBusinessAccountService.findByWaba({
      workspaceId: integration.workspaceId,
      wabaId: integration.wabaId,
      tx,
    })
    // A failed refresh restores the phone-row claim only. The WABA cache
    // remains authoritative until a successful scope check replaces it.
    if (
      !(waba && input.capiScopeCheckedAt) ||
      input.capiScopeCheckedAt !== input.expectedCapiScopeCheckedAt
    ) {
      return tx
        ? await integrationWhatsappRepository.updateCapiScopeCache(input, tx)
        : await integrationWhatsappRepository.updateCapiScopeCache(input)
    }

    const grantedScopes = input.hasCapiScope
      ? [...new Set([...waba.grantedScopes, WHATSAPP_CAPI_SCOPE])]
      : waba.grantedScopes.filter((scope) => scope !== WHATSAPP_CAPI_SCOPE)
    const updated = await whatsappBusinessAccountService.updateScopeCache({
      workspaceId: integration.workspaceId,
      wabaId: integration.wabaId,
      grantedScopes,
      scopeCheckedAt: input.capiScopeCheckedAt,
      expectedRevision: waba.revision,
      tx,
    })
    if (!updated) {
      return await whatsappCapiReadinessAdapter.findWorkspaceIntegration(
        input,
        tx,
      )
    }
    return {
      ...integration,
      hasCapiScope: updated.grantedScopes.includes(WHATSAPP_CAPI_SCOPE),
      capiScopeCheckedAt: updated.scopeCheckedAt,
    }
  },
  updateDatasetId: (input, tx) =>
    integrationWhatsappRepository.updateDatasetId(input, tx),
  updateCapiTestEventCode: (input, tx) =>
    integrationWhatsappRepository.updateCapiTestEventCode(input, tx),
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
