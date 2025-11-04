import { UpdateChatbotForm } from "@/features/chatbot/update-chatbot-form"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function GeneralPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const { chatbot } = await assertCurrentUserCanAccessChatbot(params.chatbotId)

  return (
    <div className="px-4">
      <UpdateChatbotForm chatbot={chatbot} />
    </div>
  )
}
