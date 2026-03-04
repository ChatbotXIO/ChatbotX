import { db } from "@aha.chat/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { AIMcpServerCollection, ListAIMcpServersRequest } from "../schemas"

export async function listAIMcpServers(
  input: ListAIMcpServersRequest,
): Promise<AIMcpServerCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await db.query.aiMCPServerModel.findMany({
    where: {
      chatbotId: input.chatbotId,
    },
  })

  return { data }
}
