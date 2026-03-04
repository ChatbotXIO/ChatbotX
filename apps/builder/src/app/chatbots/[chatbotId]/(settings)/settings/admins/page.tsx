import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { getTranslations } from "next-intl/server"
import { ChatbotMembersTable } from "@/features/chatbot-members/chatbot-members-table"
import { getAgents } from "@/features/chatbot-members/queries"
import { getChatbotMembersSearchParamsCache } from "@/features/chatbot-members/schemas/get-chatbot-members.request"

export default async function SettingsAdminPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const t = await getTranslations()

  const promises = Promise.all([
    getAgents({
      chatbotId,
      ...getChatbotMembersSearchParamsCache.parse({}),
    }),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-2xl">
          {t("admins.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChatbotMembersTable promises={promises} />
      </CardContent>
    </Card>
  )
}
