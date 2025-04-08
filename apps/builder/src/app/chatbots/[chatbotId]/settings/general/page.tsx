import { UpdateChatbotForm } from "@/features/chatbot/update/update-chatbot-form"
import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"

export default async function GeneralPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const userId = await getCurrentUserId()

  const { chatbot } = await findChatbotOrFail(userId, params.chatbotId)

  return <UpdateChatbotForm id={params.chatbotId} chatbot={chatbot} />
}
