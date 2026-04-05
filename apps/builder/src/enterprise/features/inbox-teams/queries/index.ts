import { db } from "@chatbotx.io/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListInboxTeamsRequest,
  ListInboxTeamsResponse,
} from "../schema/action"

export async function listInboxTeams(
  input: ListInboxTeamsRequest,
): Promise<ListInboxTeamsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.inboxTeamModel.findMany({
    where: {
      workspaceId: input.workspaceId,
    },
    with: {
      inboxTeamMembers: {
        with: {
          user: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
