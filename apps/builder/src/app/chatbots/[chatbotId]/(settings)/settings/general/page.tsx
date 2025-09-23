import { UpdateChatbotForm } from "@/features/chatbot/update-chatbot-form"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"

export default async function GeneralPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const userId = await getCurrentUserId()
  const { chatbot } = await findChatbotOrFail(userId, params.chatbotId)

  return (
    <div className="px-4">
      <UpdateChatbotForm chatbot={chatbot} />
    </div>
  )
}
