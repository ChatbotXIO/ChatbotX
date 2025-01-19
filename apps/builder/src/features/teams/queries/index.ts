import { getCurrentUserId } from "@/auth"
import type { GetTeamsSchema } from "@/features/teams/schemas/get-teams-schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma } from "@ahachat.ai/database"
import type { Prisma, Team } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export async function getTeams(
  input: GetTeamsSchema,
): Promise<{ data: Team[] }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.TeamWhereInput = {
          chatbotId: input.chatbotId,
        }

        const data = await prisma.team.findMany({ where })

        return { data }
      } catch (err) {
        return { data: [] }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#teams`],
    },
  )()
}
