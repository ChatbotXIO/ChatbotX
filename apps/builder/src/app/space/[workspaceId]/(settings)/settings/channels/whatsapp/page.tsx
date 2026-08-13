import { platformCredentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationWhatsapps } from "@/features/integration-whatsapp/queries"
import { WhatsappManage } from "@/features/integration-whatsapp/whatsapp-manage"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const policy = await requireVisibleChannel(workspaceId, "whatsapp")
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: policy.ownerId,
    type: "whatsapp",
  })

  const hasWhatsappSettings = Boolean(credential?.publicConfig.clientId)

  const promises = Promise.all([
    listIntegrationWhatsapps({
      workspaceId,
    }),
  ])
  const canCreate = await resolveChannelCreatable(workspaceId, "whatsapp")

  return (
    <WhatsappManage
      canCreate={canCreate}
      isEnabled={hasWhatsappSettings}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
