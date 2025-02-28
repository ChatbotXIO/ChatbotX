import { getCurrentUserId } from "@/auth"
import type { GetInboxTeamsSchema } from "@/features/inbox-teams/schemas/get-inbox-teams-schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { InboxTeam, Prisma } from "@ahachat.ai/database"
import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export async function getInboxTeams(
  input: GetInboxTeamsSchema,
): Promise<{ data: InboxTeam[] }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.InboxTeamWhereInput = {
          chatbotId: input.chatbotId,
        }

        const data = await prisma.inboxTeam.findMany({ where })

        return { data }
      } catch (_err) {
        return { data: [] }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#inboxTeams`],
    },
  )()
}
