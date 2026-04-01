import { db } from "@chatbotx.io/database/client"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { MessengerManage } from "@/features/integration-messenger/messenger-manage"
import { listIntegrationMessengers } from "@/features/integration-messenger/queries"
import { findOrganization } from "@/features/organization/queries"

export default async function SettingChannelMessengerPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const chatbot = await db.query.chatbotModel.findFirst({
    where: {
      id: chatbotId,
    },
  })
  if (!chatbot) {
    return notFound()
  }

  const promises = Promise.all([
    listIntegrationMessengers({
      chatbotId,
    }),
    findOrganization({
      id: chatbot.organizationId,
    }),
  ])

  return <MessengerManage chatbotId={chatbotId} promises={promises} />
}
