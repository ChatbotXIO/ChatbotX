import { prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { AIMcpServerCollection, GetAIMcpServersRequest } from "../schemas"

export async function getAIMcpServers(
  input: GetAIMcpServersRequest,
): Promise<AIMcpServerCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await prisma.aIMCPServer.findMany({
    where: {
      chatbotId: input.chatbotId,
    },
  })

  return { data }
}
