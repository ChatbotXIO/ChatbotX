import { db } from "@aha.chat/database/client"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListInboxTeamsRequest } from "../schemas/list-inbox-teams.request"
import type { InboxTeamResource } from "../schemas/resource"

export async function getInboxTeams(
  input: ListInboxTeamsRequest,
): Promise<PaginatedResponse<InboxTeamResource>> {
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
