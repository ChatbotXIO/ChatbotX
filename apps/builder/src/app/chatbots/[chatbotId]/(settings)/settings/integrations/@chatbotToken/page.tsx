import { notFound } from "next/navigation"
import ManageAccessTokenPage from "@/features/chatbot/manage-access-token"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingsIntegrationGeminiPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const userAndChatbot = await getCurrentUserAndTargetChatbot(params.chatbotId)
  if (!userAndChatbot) {
    return notFound()
  }

  return <ManageAccessTokenPage chatbot={userAndChatbot.targetChatbot} />
}
