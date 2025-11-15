import { findChatbot } from "@/features/chatbot/queries"
import { findIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"
import { findOrganizationSettingsByKey } from "@/features/organization/queries"

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
    findOrganizationSettingsByKey(
      {
        id: chatbot.organizationId,
      },
      "zalo",
    ),
  ])

  return <ZaloManage promises={promises} />
}
