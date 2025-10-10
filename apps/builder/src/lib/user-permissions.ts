import { prisma } from "@aha.chat/database"
import type { ChatbotMemberModel, ChatbotModel } from "@aha.chat/database/types"
import { NotfoundException } from "./errors/exception"

export const findChatbotOrFail = async (
  userId: string | null | undefined,
  chatbotId: string | null,
): Promise<{ chatbot: ChatbotModel; chatbotMember: ChatbotMemberModel }> => {
  if (!userId) {
    throw new NotfoundException("No User found")
  }

  if (!chatbotId) {
    throw new NotfoundException("No Chatbot found")
  }

  const chatbotMember = await prisma.chatbotMember.findFirstOrThrow({
    where: { userId, chatbotId },
    include: {
      chatbot: true,
    },
  })

  if (!chatbotMember.chatbot) {
    throw new NotfoundException("No ChatbotMember found")
  }

  return { chatbot: chatbotMember.chatbot, chatbotMember }
}
