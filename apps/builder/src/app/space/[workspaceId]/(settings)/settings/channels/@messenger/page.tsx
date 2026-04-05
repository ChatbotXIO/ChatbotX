import { db } from "@chatbotx.io/database/client"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { MessengerManage } from "@/features/integration-messenger/messenger-manage"
import { listIntegrationMessengers } from "@/features/integration-messenger/queries"
import { findOrganization } from "@/features/organization/queries"

export default async function SettingChannelMessengerPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await db.query.workspaceModel.findFirst({
    where: {
      id: workspaceId,
    },
  })
  if (!workspace) {
    return notFound()
  }

  const promises = Promise.all([
    listIntegrationMessengers({
      workspaceId,
    }),
    findOrganization({
      id: workspace.organizationId,
    }),
  ])

  return <MessengerManage promises={promises} workspaceId={workspaceId} />
}
