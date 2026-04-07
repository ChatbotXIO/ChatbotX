import { notFound } from "next/navigation"
import { listIntegrationTelegram } from "@/features/integration-telegram/queries"
import { TelegramManage } from "@/features/integration-telegram/telegram-manage"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingChannelTelegramPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const userAndChatbot = await getCurrentUserAndTargetChatbot(params.chatbotId)
  if (!userAndChatbot) {
    return notFound()
  }

  const promises = Promise.all([
    listIntegrationTelegram({
      where: { chatbotId: params.chatbotId },
    }),
  ])

  return <TelegramManage chatbotId={params.chatbotId} promises={promises} />
}
