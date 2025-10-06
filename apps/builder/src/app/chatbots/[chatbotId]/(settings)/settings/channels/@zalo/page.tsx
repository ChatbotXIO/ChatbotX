import { findChatbot } from "@/features/chatbot/queries"
import { findIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"
import { findOrganization } from "@/features/organization/queries"

export default async function SettingChannelZaloPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const chatbot = await findChatbot({
    id: params.chatbotId,
  })

  const promises = Promise.all([
    findIntegrationZalo({
      chatbotId: params.chatbotId,
    }),
    findOrganization({
      id: chatbot.organizationId,
    }),
  ])

  return <ZaloManage promises={promises} />
}
