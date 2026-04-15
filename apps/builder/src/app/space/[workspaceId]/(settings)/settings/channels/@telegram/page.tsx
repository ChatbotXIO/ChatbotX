import { listIntegrationTelegrams } from "@/features/integration-telegram/queries"
import { TelegramManage } from "@/features/integration-telegram/telegram-manage"

export default async function SettingChannelTelegramPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await props.params

  const promises = Promise.all([
    listIntegrationTelegrams({
      where: { workspaceId },
    }),
  ])

  return <TelegramManage promises={promises} workspaceId={workspaceId} />
}
