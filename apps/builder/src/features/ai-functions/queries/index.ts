import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"
import type { AIFunctionCollection, GetAIFunctionsRequest } from "../schemas"

export async function getAIFunctions(
  input: GetAIFunctionsRequest,
): Promise<AIFunctionCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await unstable_cache(
    async () => {
      const data = await prisma.aIFunction.findMany({
        where: {
          chatbotId: input.chatbotId,
        },
        include: {
          triggerFlow: true,
        },
      })

      return { data }
    },
    [JSON.stringify(input)],
    calcCacheTags(`chatbots:${input.chatbotId}#aiFunctions`),
  )()
}
