"use client"

import { Separator } from "@aha.chat/ui/components/ui/separator"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import { UpdateChatbotAdvancedForm } from "./update-chatbot-advanced-form"
import { UpdateChatbotBasicForm } from "./update-chatbot-basic-form"

export function UpdateChatbotForm({ chatbot }: { chatbot: ChatbotResource }) {
  return (
    <div className="flex flex-col gap-2">
      <UpdateChatbotBasicForm chatbot={chatbot} />
      <Separator className="my-4" />
      <UpdateChatbotAdvancedForm chatbot={chatbot} />
    </div>
  )
}
