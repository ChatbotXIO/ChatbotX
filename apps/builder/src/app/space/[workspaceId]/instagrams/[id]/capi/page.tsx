import {
  metaConversionsService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  debugToken,
  hasInstagramManageEventsScope,
  toAppAccessToken,
} from "@chatbotx.io/integration-instagram-facebook"
import { notFound } from "next/navigation"
import { InstagramCapiTab } from "@/features/integration-instagram/components/instagram-capi-tab"
import { findIntegrationInstagram } from "@/features/integration-instagram/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

export default async function InstagramCapiPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const [workspace, integrationInstagram] = await Promise.all([
    workspaceService.findById({ id: workspaceId }),
    findIntegrationInstagram({ workspaceId, id }),
  ])
  const instagramCredential =
    integrationInstagram.type === "facebook"
      ? await platformCredentialService.resolveForOwner({
          ownerId: await resolveOwnerForWorkspace(workspace),
          type: "instagramFacebook",
        })
      : null
  // A manual access token + dataset is ready without the OAuth scope, and a
  // user-disconnected integration must stay disconnected — both skip the scope
  // refresh (which can throw CapiScopeRefreshError on an expired OAuth token).
  const usesManualToken = Boolean(
    integrationInstagram.capiAccessToken && integrationInstagram.datasetId,
  )
  const capiDisconnected = Boolean(integrationInstagram.capiDisconnectedAt)
  const refreshed =
    instagramCredential && !(usesManualToken || capiDisconnected)
      ? await metaConversionsService
          .refreshCapiScopeCache({
            channel: "instagram",
            integration: integrationInstagram,
            checkScope: async ({ accessToken }) => {
              const debug = await debugToken({
                inputToken: accessToken,
                appAccessToken: toAppAccessToken(instagramCredential.config),
                version: instagramCredential.config.version,
              })
              return hasInstagramManageEventsScope(debug.scopes)
            },
          })
          .catch(() => integrationInstagram)
      : integrationInstagram

  const resolved = refreshed ?? integrationInstagram

  return (
    <InstagramCapiTab
      capiDisconnected={capiDisconnected}
      credentialAvailable={Boolean(instagramCredential)}
      hasManualCapiAccessToken={Boolean(resolved.capiAccessToken)}
      integrationInstagram={{
        id: resolved.id,
        type: resolved.type,
        hasCapiScope: resolved.hasCapiScope,
        datasetId: resolved.datasetId,
      }}
    />
  )
}
