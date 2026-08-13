import { platformCredentialService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { MessengerManage } from "@/features/integration-messenger/messenger-manage"
import { listIntegrationMessengers } from "@/features/integration-messenger/queries"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelMessengerPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const policy = await requireVisibleChannel(workspaceId, "messenger")
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: policy.ownerId,
    type: "messenger",
  })

  const promises = Promise.all([
    listIntegrationMessengers({
      workspaceId,
    }),
  ])
  const canCreate = await resolveChannelCreatable(workspaceId, "messenger")

  return (
    <MessengerManage
      canCreate={canCreate}
      promises={promises}
      publicConfig={credential?.publicConfig ?? null}
      workspaceId={workspaceId}
    />
  )
}
