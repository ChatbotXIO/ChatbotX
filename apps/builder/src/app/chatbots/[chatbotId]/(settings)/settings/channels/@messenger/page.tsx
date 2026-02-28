import { db } from "@aha.chat/database/client"
import { notFound } from "next/navigation"
import { MessengerManage } from "@/features/integration-messenger/messenger-manage"
import { findIntegrationMessenger } from "@/features/integration-messenger/queries"
import { findOrganization } from "@/features/organization/queries"

export default async function SettingChannelMessengerPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const chatbot = await db.query.chatbotModel.findFirst({
    where: {
      id: params.chatbotId,
    },
  })
  if (!chatbot) {
    return notFound()
  }

  const promises = Promise.all([
    findIntegrationMessenger({
      chatbotId: params.chatbotId,
    }),
    findOrganization({
      id: chatbot.organizationId,
    }),
  ])

  return <MessengerManage promises={promises} />
}
