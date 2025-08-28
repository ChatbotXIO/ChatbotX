import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { calcCacheTags } from "@/lib/cache-helper"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { AIMcpServerCollection, GetAIMcpServersRequest } from "../schemas"

export async function getAIMcpServers(
  input: GetAIMcpServersRequest,
): Promise<AIMcpServerCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const data = await prisma.aIMCPServer.findMany({
        where: {
          chatbotId: input.chatbotId,
        },
      })

      return { data }
    },
    [JSON.stringify(input)],
    calcCacheTags(`chatbots:${input.chatbotId}#aiMcpServers`),
  )()
}
