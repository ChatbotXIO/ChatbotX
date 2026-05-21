import { credentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationWhatsapps } from "@/features/integration-whatsapp/queries"
import { WhatsappManage } from "@/features/integration-whatsapp/whatsapp-manage"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userId = await getCurrentUserId()
  const credential = await credentialService.resolveForUser({
    userId,
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
