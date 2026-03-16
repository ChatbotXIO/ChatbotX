import { notFound } from "next/navigation"
import { findIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"
import { findOrganization } from "@/features/organization/queries"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingChannelZaloPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const userAndChatbot = await getCurrentUserAndTargetChatbot(params.chatbotId)
  if (!userAndChatbot) {
    return notFound()
  }

  const promises = Promise.all([
    findIntegrationZalo({
      chatbotId: params.chatbotId,
    }),
    findOrganization({
      id: userAndChatbot.targetChatbot.organizationId,
    }),
  ])

  return <ZaloManage promises={promises} />
}
