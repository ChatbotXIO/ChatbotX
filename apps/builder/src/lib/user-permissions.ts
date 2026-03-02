import { findOrFail } from "@aha.chat/database/client"
import { chatbotMemberModel, chatbotModel } from "@aha.chat/database/schema"
import type { ChatbotMemberModel, ChatbotModel } from "@aha.chat/database/types"
import type { ChatbotResource } from "@/features/chatbots/schemas/resource"
import { NotfoundException } from "./errors/exception"

export const findChatbotOrFail = async (
  userId: string | null | undefined,
  chatbotId: string | null,
): Promise<{ chatbot: ChatbotResource; chatbotMember: ChatbotMemberModel }> => {
  if (!userId) {
    throw new NotfoundException("No User found")
  }

  if (!chatbotId) {
    throw new NotfoundException("No Chatbot found")
  }

  const chatbotMember = await findOrFail<ChatbotMemberModel>(
    chatbotMemberModel,
    {
      userId,
      chatbotId,
    },
    "Chatbot member not found",
  )
  const chatbot = await findOrFail<ChatbotModel>(
    chatbotModel,
    {
      id: chatbotId,
    },
    "Chatbot not found",
  )

  return { chatbot, chatbotMember }
}
