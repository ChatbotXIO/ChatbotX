import { db } from "@chatbotx.io/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListAIMcpServersRequest,
  ListAIMcpServersResponse,
} from "../schema/action"

export async function listAIMcpServers(
  input: ListAIMcpServersRequest,
): Promise<ListAIMcpServersResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.aiMCPServerModel.findMany({
    where: {
      workspaceId: input.workspaceId,
    },
  })

  return { data }
}
