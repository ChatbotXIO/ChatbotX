"use server"

import { prisma } from "@aha.chat/database"
import type { ChatbotModel, ChatbotWhereInput } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { calcCacheTags } from "@/lib/cache-helper"

export const findChatbot = async (
  where: ChatbotWhereInput,
): Promise<ChatbotModel> => {
  return await unstable_cache(
    async () => {
      return await prisma.chatbot.findFirstOrThrow({
        where,
      })
    },
    [JSON.stringify(where)],
    calcCacheTags("chatbots"),
  )()
}
