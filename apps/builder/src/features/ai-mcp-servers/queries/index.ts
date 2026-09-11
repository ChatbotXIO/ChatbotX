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

  return await aiMcpServerService.listAIMcpServers(input)
}
