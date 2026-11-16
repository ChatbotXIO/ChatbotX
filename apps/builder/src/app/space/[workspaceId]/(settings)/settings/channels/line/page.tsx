import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { LineManage } from "@/features/integration-line/line-manage"
import { listIntegrationLines } from "@/features/integration-line/queries"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelLinePage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await requireVisibleChannel(workspaceId, "line")

  const promises = Promise.all([
    listIntegrationLines({
      where: { workspaceId },
    }),
  ])
  const canCreate = await resolveChannelCreatable(workspaceId, "line")

  return (
    <LineManage
      canCreate={canCreate}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
