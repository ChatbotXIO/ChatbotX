"use server"

import { calcCacheTags } from "@/lib/cache-helper"
import { prisma } from "@aha.chat/database"
import type { ChatbotModel, ChatbotWhereInput } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"

export const findChatbot = async (
  where: ChatbotWhereInput,
): Promise<ChatbotModel> => {
  return unstable_cache(
    async () => {
      return await prisma.chatbot.findFirstOrThrow({
        where,
      })
    },
    [JSON.stringify(where)],
    calcCacheTags("chatbots"),
  )()
}
