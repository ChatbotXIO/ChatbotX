import { aiMcpServerService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListAIMcpServersRequest,
  ListAIMcpServersResponse,
} from "../schema/action"

export async function listAIMcpServers(
  input: ListAIMcpServersRequest,
): Promise<ListAIMcpServersResponse & { pageCount: number }> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await aiMcpServerService.list({
    where: { workspaceId: input.workspaceId },
  })

  return { data, pageCount: 1 }
}
