import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { ListInboxTeamsRequest } from "../schemas/list-inbox-teams.request"
import type { InboxTeamCollection } from "../schemas/types"

export async function getInboxTeams(
  input: ListInboxTeamsRequest,
): Promise<InboxTeamCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
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
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#inboxTeams`],
    },
  )()
}
