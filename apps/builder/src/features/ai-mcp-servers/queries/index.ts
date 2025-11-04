import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"
import type { AIMcpServerCollection, GetAIMcpServersRequest } from "../schemas"

export async function getAIMcpServers(
  input: GetAIMcpServersRequest,
): Promise<AIMcpServerCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

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
