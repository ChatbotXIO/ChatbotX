import { organizationService, workspaceService } from "@chatbotx.io/business"
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

  const workspace = await workspaceService.findOrFail({
    where: { id: workspaceId },
  })
  const organization = await organizationService.findOrFail({
    where: { id: workspace.organizationId },
  })

  const hasWhatsappSettings = Boolean(organization.settings?.whatsapp?.clientId)

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
