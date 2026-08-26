import {
  integrationWhatsappService,
  metaConversionsService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { checkMessagingAdsConnectionState } from "@/features/ads-campaign/queries"
import { WhatsappCapiTab } from "@/features/integration-whatsapp/components/whatsapp-capi-tab"
import { hasWhatsappCapiScope } from "@/features/integration-whatsapp/libs/capi-scope"
import { WHATSAPP_OAUTH_CALLBACK_PATH } from "@/features/integration-whatsapp/libs/embedded-signup"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { resolveProviderOriginForCredential } from "@/lib/provider-origin"

export default async function WhatsappCapiPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const [workspace, integrationWhatsapp, messagingAdsConnectionState] =
    await Promise.all([
      workspaceService.findById({ id: workspaceId }),
      integrationWhatsappService.findByIdForWorkspace({ id, workspaceId }),
      checkMessagingAdsConnectionState({
        workspaceId,
        channel: "whatsapp",
        integrationId: id,
      }),
    ])
  if (!integrationWhatsapp) {
    return notFound()
  }

  const whatsappCredential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
    type: "whatsapp",
  })

  // A manual access token + dataset is ready without the OAuth scope, and a
  // user-disconnected integration must stay disconnected — both skip the scope
  // refresh (which can throw CapiScopeRefreshError on an expired OAuth token).
  const usesManualToken = Boolean(
    integrationWhatsapp.capiAccessToken && integrationWhatsapp.datasetId,
  )
  const capiDisconnected = Boolean(integrationWhatsapp.capiDisconnectedAt)
  const refreshed =
    whatsappCredential && !(usesManualToken || capiDisconnected)
      ? await metaConversionsService
          .refreshCapiScopeCache({
            channel: "whatsapp",
            integration: integrationWhatsapp,
            checkScope: ({ accessToken, resourceId }) =>
              hasWhatsappCapiScope({
                accessToken,
                appAccessToken: `${whatsappCredential.config.clientId}|${whatsappCredential.config.clientSecret}`,
                wabaId: resourceId,
              }),
          })
          .catch(() => integrationWhatsapp)
      : integrationWhatsapp

  const resolved = refreshed ?? integrationWhatsapp
  const oauthCallbackOrigin =
    await resolveProviderOriginForCredential(whatsappCredential)

  return (
    <WhatsappCapiTab
      capiDisconnected={capiDisconnected}
      credentialAvailable={Boolean(whatsappCredential)}
      hasManualCapiAccessToken={Boolean(resolved.capiAccessToken)}
      integrationWhatsapp={{
        id: resolved.id,
        name: resolved.name,
        displayPhoneNumber: resolved.displayPhoneNumber,
        wabaId: resolved.wabaId,
        hasCapiScope: resolved.hasCapiScope,
        datasetId: resolved.datasetId,
      }}
      messagingAdsConnectionState={messagingAdsConnectionState}
      oauthCallbackUrl={new URL(
        WHATSAPP_OAUTH_CALLBACK_PATH,
        oauthCallbackOrigin,
      ).toString()}
      whatsappCredentialPublic={whatsappCredential?.publicConfig ?? null}
    />
  )
}
