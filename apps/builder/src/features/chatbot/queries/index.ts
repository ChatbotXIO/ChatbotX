"use server"

import { db } from "@aha.chat/database/client"
import type { ChatbotModel } from "@aha.chat/database/types"
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
