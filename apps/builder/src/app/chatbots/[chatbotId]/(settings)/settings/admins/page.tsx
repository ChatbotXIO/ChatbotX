import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ChatbotMembersTable } from "@/features/chatbot-members/chatbot-members-table"
import { listChatbotMembers } from "@/features/chatbot-members/queries"
import { getChatbotMembersSearchParamsCache } from "@/features/chatbot-members/schema/query"

export default async function SettingsAdminPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  const t = await getTranslations()

  const promises = Promise.all([
    listChatbotMembers({
      chatbotId,
      ...getChatbotMembersSearchParamsCache.parse({}),
    }),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">{t("admins.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChatbotMembersTable promises={promises} />
      </CardContent>
    </Card>
  )
}
