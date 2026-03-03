"use client"

import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import { UpdateChatbotAdvancedForm } from "./update-chatbot-advanced-form"
import { UpdateChatbotBasicForm } from "./update-chatbot-basic-form"

export function UpdateChatbotForm({ chatbot }: { chatbot: ChatbotResource }) {
  return (
    <div className="flex flex-col gap-4">
      <UpdateChatbotBasicForm chatbot={chatbot} />
      <UpdateChatbotAdvancedForm chatbot={chatbot} />
    </div>
  )
}
