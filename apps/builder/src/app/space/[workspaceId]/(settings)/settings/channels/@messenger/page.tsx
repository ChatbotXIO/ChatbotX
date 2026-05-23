import {
  platformCredentialService,
  workspaceService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { MessengerManage } from "@/features/integration-messenger/messenger-manage"
import { listIntegrationMessengers } from "@/features/integration-messenger/queries"

export default async function SettingChannelMessengerPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  if (!workspace) {
    return notFound()
  }
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: workspace.ownerId,
    type: "messenger",
  })

  const promises = Promise.all([
    listIntegrationMessengers({
      workspaceId,
    }),
  ])

  return (
    <MessengerManage
      promises={promises}
      publicConfig={credential?.publicConfig ?? null}
      workspaceId={workspaceId}
    />
  )
}
