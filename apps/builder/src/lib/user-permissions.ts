import { prisma } from "@aha.chat/database"
import type { ChatbotMemberModel } from "@aha.chat/database/types"
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

  const chatbotMember = await prisma.chatbotMember.findFirstOrThrow({
    where: { userId, chatbotId },
  })
  const chatbot = await prisma.chatbot.findFirstOrThrow({
    where: { id: chatbotId },
  })

  return { chatbot, chatbotMember }
}
