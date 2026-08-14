import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { listIntegrationTelegrams } from "@/features/integration-telegram/queries"
import { TelegramManage } from "@/features/integration-telegram/telegram-manage"
import { requireVisibleChannel } from "@/lib/workspace/require-visible-channel"
import { resolveChannelCreatable } from "@/lib/workspace/resolve-channel-creatable"

export default async function SettingChannelTelegramPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await requireVisibleChannel(workspaceId, "telegram")

  const promises = Promise.all([
    listIntegrationTelegrams({
      where: { workspaceId },
    }),
  ])
  const canCreate = await resolveChannelCreatable(workspaceId, "telegram")

  return (
    <TelegramManage
      canCreate={canCreate}
      promises={promises}
      workspaceId={workspaceId}
    />
  )
}
