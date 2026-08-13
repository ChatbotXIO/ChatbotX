import {
  type IntegrationWhatsappResource,
  integrationFacebookAdsService,
  integrationWhatsappService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import type { WhatsappCredentialPublic } from "@chatbotx.io/database/partials"
import { needsFacebookAdsReconnect } from "@/features/integration-facebook-ads/lib/needs-reconnect"
import { integrationFacebookAdsResource } from "@/features/integration-facebook-ads/schemas"
import { hasWhatsappCapiScope } from "@/features/integration-whatsapp/libs/capi-scope"

export type ConnectAccountsWhatsapp = IntegrationWhatsappResource & {
  needsReconnect: boolean
  inbox?: { id: string; name: string } | null
}

export type ConnectAccountsData = {
  whatsappIntegrations: ConnectAccountsWhatsapp[]
  whatsappCredentialPublic: WhatsappCredentialPublic | null
  facebookAds: {
    connected: boolean
    needsReconnect: boolean
  }
}

export async function getConnectAccountsData(
  workspaceId: string,
): Promise<ConnectAccountsData> {
  const workspace = await workspaceService.findById({ id: workspaceId })
  const whatsappCredential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "whatsapp",
  })
  const appAccessToken = whatsappCredential
    ? `${whatsappCredential.config.clientId}|${whatsappCredential.config.clientSecret}`
    : null

  const whatsappRows =
    await integrationWhatsappService.listByWorkspaceId(workspaceId)
  const facebookAdsRow =
    await integrationFacebookAdsService.findByWorkspaceId(workspaceId)
  const facebookAdsResource =
    integrationFacebookAdsResource.safeParse(facebookAdsRow).data

  const whatsappIntegrations = await Promise.all(
    whatsappRows.map(async (integration) => {
      const refreshed = appAccessToken
        ? await integrationWhatsappService.refreshCapiScopeCache({
            id: integration.id,
            workspaceId,
            checkScope: ({ accessToken, wabaId }) =>
              hasWhatsappCapiScope({
                accessToken,
                appAccessToken,
                wabaId,
              }),
          })
        : integration

      const hasCapiScope = refreshed?.hasCapiScope ?? integration.hasCapiScope

      return {
        id: integration.id,
        name: integration.name,
        inboxId: integration.inboxId,
        displayPhoneNumber: integration.displayPhoneNumber,
        phoneNumberId: integration.phoneNumberId,
        wabaId: integration.wabaId,
        hasCapiScope,
        capiScopeCheckedAt:
          refreshed?.capiScopeCheckedAt ?? integration.capiScopeCheckedAt,
        datasetId: integration.datasetId,
        tokenRefreshError: integration.tokenRefreshError,
        inbox: integration.inbox,
        needsReconnect: !hasCapiScope,
      }
    }),
  )

  return {
    whatsappIntegrations,
    whatsappCredentialPublic: whatsappCredential?.publicConfig ?? null,
    facebookAds: facebookAdsResource
      ? {
          connected: true,
          needsReconnect: needsFacebookAdsReconnect(facebookAdsResource),
        }
      : { connected: false, needsReconnect: false },
  }
}
