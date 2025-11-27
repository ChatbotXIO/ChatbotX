import { ChatbotMembersTable } from "@/features/chatbot-members/chatbot-members-table"
import { getAgents } from "@/features/chatbot-members/queries"
import { getChatbotMembersSearchParamsCache } from "@/features/chatbot-members/schemas/get-chatbot-members.request"

export default async function SettingsAdminPage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  const promises = Promise.all([
    getAgents({
      chatbotId,
      ...getChatbotMembersSearchParamsCache.parse({}),
    }),
  ])

  return <ChatbotMembersTable promises={promises} />
}
