import { inboxTeamService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListInboxTeamsRequest,
  ListInboxTeamsResponse,
} from "../schema/action"

export async function listInboxTeams(
  input: ListInboxTeamsRequest,
): Promise<ListInboxTeamsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await inboxTeamService.listByWorkspace({
    workspaceId: input.workspaceId,
  })

  return { data }
}
