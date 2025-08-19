import type { ChatbotResource } from "@/features/chatbots/schemas"
import { UpdateChatbotAdvancedForm } from "./update-chatbot-advanced-form"
import { UpdateChatbotBasicForm } from "./update-chatbot-basic-form"

export function UpdateChatbotForm({ chatbot }: { chatbot: ChatbotResource }) {
  return (
    <div className="flex flex-col gap-y-4">
      <UpdateChatbotBasicForm chatbot={chatbot} />
      <UpdateChatbotAdvancedForm chatbot={chatbot} />
    </div>
  )
}
