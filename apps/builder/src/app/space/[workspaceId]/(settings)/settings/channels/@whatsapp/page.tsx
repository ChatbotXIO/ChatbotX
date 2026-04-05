import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationWhatsapps } from "@/features/integration-whatsapp/queries"
import { WhatsappManage } from "@/features/integration-whatsapp/whatsapp-manage"
import { findOrganization } from "@/features/organization/queries"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndChatbot = await getCurrentUserAndTargetChatbot(workspaceId)
  if (!userAndChatbot) {
    return notFound()
  }

  const promises = Promise.all([
    listIntegrationWhatsapps({
      workspaceId,
    }),
    findOrganization({
      id: userAndChatbot.targetChatbot.organizationId,
    }),
  ])

  return <WhatsappManage promises={promises} workspaceId={workspaceId} />
}
