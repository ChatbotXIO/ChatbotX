import { getCurrentUserId } from "@/auth"
import type { ListAIAgentsSchema } from "@/features/integrations/ai-agents/schemas/get.schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type AIAgent, type Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export async function getAIAgents(
  input: Partial<ListAIAgentsSchema>,
): Promise<{ data: AIAgent[]; pageCount: number }> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId as string)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.AIAgentWhereInput = {
          chatbotId: input.chatbotId,
        }

        if (input.name) {
          where.AND = [
            {
              name: {
                contains: input.name,
                mode: "insensitive",
              },
            },
          ]
        }

        let orderBy = undefined
        const page = input.page || 1
        const perPage = input.perPage || 10

        if (input.sort) {
          orderBy = input.sort.map((sortItem) => ({
            [sortItem.id]: sortItem.desc ? "desc" : "asc",
          }))
        }

        const [data, total] = await prisma.$transaction([
          prisma.aIAgent.findMany({
            skip: (page - 1) * perPage,
            take: perPage,
            where,
            orderBy,
          }),
          prisma.aIAgent.count({ where }),
        ])

        const pageCount = Math.ceil(total / perPage)

        return { data, pageCount }
      } catch (err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#aiAgents`],
    },
  )()
}
