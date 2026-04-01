import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import ManageAccessTokenPage from "@/features/chatbot/manage-access-token"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"

export default async function SettingsIntegrationGeminiPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }
  const userAndChatbot = await getCurrentUserAndTargetChatbot(chatbotId)
  if (!userAndChatbot) {
    return notFound()
  }

  return <ManageAccessTokenPage chatbot={userAndChatbot.targetChatbot} />
}
