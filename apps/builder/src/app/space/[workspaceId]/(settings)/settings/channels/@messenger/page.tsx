import { organizationService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { MessengerManage } from "@/features/integration-messenger/messenger-manage"
import { listIntegrationMessengers } from "@/features/integration-messenger/queries"

import { workspaceService } from "@/features/workspaces/workspace-service"

export default async function SettingChannelMessengerPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.findOrFail({
    where: { id: workspaceId },
  })
  const organization = await organizationService.findOrFail({
    where: { id: workspace.organizationId },
  })
  const hasMessengerSettings = Boolean(
    organization.settings?.messenger?.clientId,
  )

  const promises = Promise.all([
    listIntegrationMessengers({
      workspaceId,
    }),
  ])

  return (
    <MessengerManage
      isEnabled={hasMessengerSettings}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
