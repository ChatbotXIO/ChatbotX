"use server"

import { db } from "@chatbotx.io/database/client"
import type { ChatbotModel } from "@chatbotx.io/database/types"
import { notFoundException } from "@/lib/errors/exception"

export const findChatbotOrFail = async (
  where: Record<string, unknown>,
): Promise<ChatbotModel> => {
  const chatbot = await db.query.chatbotModel.findFirst({
    where,
  })
  if (!chatbot) {
    throw notFoundException("Chatbot not found")
  }
  return chatbot
}
