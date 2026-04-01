import { findOrFail } from "@chatbotx.io/database/client"
import { chatbotMemberModel, chatbotModel } from "@chatbotx.io/database/schema"
import type { ChatbotMemberModel } from "@chatbotx.io/database/types"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import { notFoundException } from "./errors/exception"

export const findChatbotOrFail = async (
  userId: bigint | null | undefined,
  chatbotId: bigint | null,
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
