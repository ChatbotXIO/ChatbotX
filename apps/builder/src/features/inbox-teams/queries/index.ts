import { prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListInboxTeamsRequest } from "../schemas/list-inbox-teams.request"
import type { InboxTeamCollection } from "../schemas/types"

export async function getInboxTeams(
  input: ListInboxTeamsRequest,
): Promise<InboxTeamCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const data = await prisma.inboxTeam.findMany({
    where: {
      chatbotId: input.chatbotId,
    },
    include: {
      inboxTeamMembers: {
        include: {
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
