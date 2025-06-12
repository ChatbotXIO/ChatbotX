import { prisma } from "@ahachat.ai/database"
import type { Chatbot, ChatbotMember } from "@ahachat.ai/database"
import { NotfoundException } from "./error"

export const findChatbotOrFail = async (
  userId: string | null | undefined,
  chatbotId: string | null,
): Promise<{ chatbot: Chatbot; chatbotMember: ChatbotMember }> => {
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
