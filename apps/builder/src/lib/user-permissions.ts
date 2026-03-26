import { findOrFail } from "@aha.chat/database/client"
import { chatbotMemberModel, chatbotModel } from "@aha.chat/database/schema"
import type { ChatbotMemberModel } from "@aha.chat/database/types"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import { notFoundException } from "./errors/exception"

export const findChatbotOrFail = async (
  userId: string | null | undefined,
  chatbotId: string | null,
): Promise<{ chatbot: ChatbotResource; chatbotMember: ChatbotMemberModel }> => {
  if (!userId) {
    throw notFoundException("No User found")
  }

  if (!chatbotId) {
    throw notFoundException("No Chatbot found")
  }

  const chatbotMember = await findOrFail(
    chatbotMemberModel,
    {
      userId,
      chatbotId,
    },
    "Chatbot member not found",
  )
  const chatbot = await findOrFail(
    chatbotModel,
    {
      id: chatbotId,
    },
    "Chatbot not found",
  )

  return { chatbot, chatbotMember }
}
