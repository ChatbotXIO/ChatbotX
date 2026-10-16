import {
  integrationWhatsappService,
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { WhatsappCapiTab } from "@/features/integration-whatsapp/components/whatsapp-capi-tab"
import { WHATSAPP_OAUTH_CALLBACK_PATH } from "@/features/integration-whatsapp/libs/embedded-signup"
import { resolveIntegrationCapiConnection } from "@/features/meta-conversions/lib/resolve-integration-capi-connection"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"
import { resolveProviderOriginForCredential } from "@/lib/provider-origin"

export default async function WhatsappAdsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const [workspace, integrationWhatsapp] = await Promise.all([
    workspaceService.findById({ id: workspaceId }),
    integrationWhatsappService.findByIdForWorkspace({ id, workspaceId }),
  ])
  if (!integrationWhatsapp) {
    return notFound()
  }

  // The popup opens the platform's dedicated Conversions API configuration, so
  // the tab needs the app's public settings and the callback registered for it.
  const whatsappCredential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveOwnerForWorkspace(workspace),
    type: "whatsapp",
  })
  const originUrl = await resolveProviderOriginForCredential(whatsappCredential)

  // The connection comes from what the integration stores — never from asking
  // Meta — and only plain fields reach the client: the encrypted token stays here.
  return (
    <WhatsappCapiTab
      connection={resolveIntegrationCapiConnection(
        "whatsapp",
        integrationWhatsapp,
      )}
      integrationWhatsapp={{
        id: integrationWhatsapp.id,
        datasetId: integrationWhatsapp.datasetId,
        capiTestEventCode: integrationWhatsapp.capiTestEventCode,
        isCoexist: integrationWhatsapp.isCoexist,
      }}
      oauthCallbackUrl={new URL(
        WHATSAPP_OAUTH_CALLBACK_PATH,
        originUrl,
      ).toString()}
      settings={whatsappCredential?.publicConfig ?? null}
    />
  )
}
