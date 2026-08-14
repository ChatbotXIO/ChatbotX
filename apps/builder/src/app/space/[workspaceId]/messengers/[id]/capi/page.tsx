import {
  metaConversionsService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  debugToken,
  hasPageEventsScope,
  toAppAccessToken,
} from "@chatbotx.io/integration-messenger"
import { notFound } from "next/navigation"
import { MessengerCapiTab } from "@/features/integration-messenger/components/messenger-capi-tab"
import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

export default async function MessengerCapiPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const [workspace, integrationMessenger] = await Promise.all([
    workspaceService.findById({ id: workspaceId }),
    findIntegrationMessenger({ workspaceId, id }),
  ])
  const messengerCredential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
    type: "messenger",
  })
  // A manual access token + dataset is ready without the OAuth scope, and a
  // user-disconnected integration must stay disconnected — both skip the scope
  // refresh (which can throw CapiScopeRefreshError on an expired OAuth token).
  const usesManualToken = Boolean(
    integrationMessenger.capiAccessToken && integrationMessenger.datasetId,
  )
  const capiDisconnected = Boolean(integrationMessenger.capiDisconnectedAt)
  const refreshed =
    messengerCredential && !(usesManualToken || capiDisconnected)
      ? await metaConversionsService
          .refreshCapiScopeCache({
            channel: "messenger",
            integration: integrationMessenger,
            checkScope: async ({ accessToken }) => {
              const debug = await debugToken({
                inputToken: accessToken,
                appAccessToken: toAppAccessToken(messengerCredential.config),
                version: messengerCredential.config.version,
              })
              return hasPageEventsScope(debug.scopes)
            },
          })
          .catch(() => integrationMessenger)
      : integrationMessenger

  const resolved = refreshed ?? integrationMessenger

  return (
    <MessengerCapiTab
      capiDisconnected={capiDisconnected}
      credentialAvailable={Boolean(messengerCredential)}
      hasManualCapiAccessToken={Boolean(resolved.capiAccessToken)}
      integrationMessenger={{
        id: resolved.id,
        hasCapiScope: resolved.hasCapiScope,
        datasetId: resolved.datasetId,
      }}
    />
  )
}
