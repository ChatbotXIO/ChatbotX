import { prisma } from "@ahachat.ai/database";
import { Chatbot, ChatbotMember, User } from "@prisma/client";

export const findChatbotOrFail = async (user: User, chatbotId: string | null): Promise<{ chatbot: Chatbot, chatbotMember: ChatbotMember }> => {
  if (!chatbotId) {
    throw new Error('No Chatbot found')
  }

  const chatbotMember = await prisma.chatbotMember.findFirstOrThrow({
    where: { userId: user.id, chatbotId: chatbotId },
    include: {
      chatbot: true
    }
  })
  if (!chatbotMember.chatbot) {
    throw new Error('No ChatbotMember found');
  }

  return { chatbot: chatbotMember.chatbot, chatbotMember }
}
