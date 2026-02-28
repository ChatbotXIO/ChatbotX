import { notFound } from "next/navigation"
import { listIntegrationWhatsapps } from "@/features/integration-whatsapp/queries"
import { WhatsappManage } from "@/features/integration-whatsapp/whatsapp-manage"
import { findOrganization } from "@/features/organization/queries"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const userAndChatbot = await getCurrentUserAndTargetChatbot(params.chatbotId)
  if (!userAndChatbot) {
    return notFound()
  }

  const promises = Promise.all([
    listIntegrationWhatsapps({
      chatbotId: params.chatbotId,
    }),
    findOrganization({
      id: userAndChatbot.targetChatbot.organizationId,
    }),
  ])

  return <WhatsappManage chatbotId={params.chatbotId} promises={promises} />
}
