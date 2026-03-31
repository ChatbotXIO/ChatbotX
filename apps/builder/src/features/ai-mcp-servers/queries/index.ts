import { db } from "@aha.chat/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListAIMcpServersRequest,
  ListAIMcpServersResponse,
} from "../schema/action"

export async function listAIMcpServers(
  input: ListAIMcpServersRequest,
): Promise<ListAIMcpServersResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await db.query.aiMCPServerModel.findMany({
    where: {
      chatbotId: input.chatbotId,
    },
  })

  return { data }
}
