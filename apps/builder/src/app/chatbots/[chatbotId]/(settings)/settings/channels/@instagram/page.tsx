import { db } from "@aha.chat/database/client"
import { notFound } from "next/navigation"
import { InstagramManage } from "@/features/integration-instagram/instagram-manage"
import { listIntegrationInstagrams } from "@/features/integration-instagram/queries"
import { findOrganization } from "@/features/organization/queries"

export default async function SettingChannelInstagramPage(props: {
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
    listIntegrationInstagrams({
      chatbotId: params.chatbotId,
    }),
    findOrganization({
      id: chatbot.organizationId,
    }),
  ])

  return <InstagramManage chatbotId={params.chatbotId} promises={promises} />
}
