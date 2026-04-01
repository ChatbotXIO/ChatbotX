import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"
import { findOrganization } from "@/features/organization/queries"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingChannelZaloPage(props: {
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
    listIntegrationZalo({
      where: { chatbotId },
    }),
    findOrganization({
      id: userAndChatbot.targetChatbot.organizationId,
    }),
  ])

  return <ZaloManage chatbotId={chatbotId} promises={promises} />
}
