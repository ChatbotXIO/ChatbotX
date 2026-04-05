import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationZalo } from "@/features/integration-zalo/queries"
import { ZaloManage } from "@/features/integration-zalo/zalo-manage"
import { findOrganization } from "@/features/organization/queries"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingChannelZaloPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndChatbot = await getCurrentUserAndTargetChatbot(workspaceId)
  if (!userAndChatbot) {
    return notFound()
  }

  const promises = Promise.all([
    listIntegrationZalo({
      where: { workspaceId },
    }),
    findOrganization({
      id: userAndChatbot.targetChatbot.organizationId,
    }),
  ])

  return <ZaloManage promises={promises} workspaceId={workspaceId} />
}
