import { db } from "@chatbotx.io/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListAIMcpServersRequest,
  ListAIMcpServersResponse,
} from "../schemas/action"

export async function listAIMcpServers(
  input: ListAIMcpServersRequest,
): Promise<ListAIMcpServersResponse & { pageCount: number }> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.aiMCPServerModel.findMany({
    where: {
      workspaceId: input.workspaceId,
    },
  })

  return { data, pageCount: 1 }
}
