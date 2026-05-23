import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationWhatsapps } from "@/features/integration-whatsapp/queries"
import { WhatsappManage } from "@/features/integration-whatsapp/whatsapp-manage"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return notFound()
  }
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "whatsapp",
  })

  const hasWhatsappSettings = Boolean(credential?.publicConfig.clientId)

  const promises = Promise.all([
    listIntegrationWhatsapps({
      workspaceId,
    }),
  ])

  return (
    <WhatsappManage
      isEnabled={hasWhatsappSettings}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
