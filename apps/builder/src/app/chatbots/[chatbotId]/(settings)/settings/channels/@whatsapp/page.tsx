import { findChatbot } from "@/features/chatbot/queries"
import { listIntegrationWhatsapps } from "@/features/integration-whatsapp/queries"
import { WhatsappManage } from "@/features/integration-whatsapp/whatsapp-manage"
import { findOrganization } from "@/features/organization/queries"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const chatbot = await findChatbot({ id: params.chatbotId })
  const promises = Promise.all([
    listIntegrationWhatsapps({
      where: {
        chatbotId: params.chatbotId,
      },
    }),
    findOrganization({
      id: chatbot.organizationId,
    }),
  ])

  return <WhatsappManage chatbotId={params.chatbotId} promises={promises} />
}
