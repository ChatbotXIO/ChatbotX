"use server"

import { prisma } from "@aha.chat/database"
import type { ChatbotModel, ChatbotWhereInput } from "@aha.chat/database/types"

export const findChatbot = async (
  where: ChatbotWhereInput,
): Promise<ChatbotModel> =>
  await prisma.chatbot.findFirstOrThrow({
    where,
  })
