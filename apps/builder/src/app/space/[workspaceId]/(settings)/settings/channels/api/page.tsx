import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ApiManage } from "@/features/integration-api/api-manage"
import { listIntegrationApis } from "@/features/integration-api/queries"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelApiPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await requireVisibleChannel(workspaceId, "api")

  const promises = listIntegrationApis({ workspaceId })
  const canCreate = await resolveChannelCreatable(workspaceId, "api")

  return (
    <ApiManage
      canCreate={canCreate}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
