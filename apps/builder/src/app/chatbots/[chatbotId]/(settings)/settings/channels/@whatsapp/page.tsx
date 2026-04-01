import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationWhatsapps } from "@/features/integration-whatsapp/queries"
import { WhatsappManage } from "@/features/integration-whatsapp/whatsapp-manage"
import { findOrganization } from "@/features/organization/queries"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const userAndChatbot = await getCurrentUserAndTargetChatbot(chatbotId)
  if (!userAndChatbot) {
    return notFound()
  }

  const promises = Promise.all([
    listIntegrationWhatsapps({
      chatbotId,
    }),
    findOrganization({
      id: userAndChatbot.targetChatbot.organizationId,
    }),
  ])

  return <WhatsappManage chatbotId={chatbotId} promises={promises} />
}
