import { db } from "@aha.chat/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListInboxTeamsRequest,
  ListInboxTeamsResponse,
} from "../schema/action"

export async function listInboxTeams(
  input: ListInboxTeamsRequest,
): Promise<ListInboxTeamsResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await db.query.inboxTeamModel.findMany({
    where: {
      chatbotId: input.chatbotId,
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

  return { data, pageCount: 1 }
}
