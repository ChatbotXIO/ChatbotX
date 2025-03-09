import { getCurrentUserId } from "@/auth"
import type { ListAIAgentsRequest } from "@/features/integrations/ai-agents/schemas/list.schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type AIAgent, type Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export async function getAIAgents(
  input: ListAIAgentsRequest,
): Promise<{ data: AIAgent[]; pageCount: number }> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.AIAgentWhereInput = {
          chatbotId: input.chatbotId,
        }

        if (input.name) {
          where.name = {
            contains: input.name,
            mode: "insensitive",
          }
        }

        const orderBy = input.sort.map((sortItem) => ({
          [sortItem.id]: sortItem.desc ? "desc" : "asc",
        }))

        const [data, total] = await prisma.$transaction([
          prisma.aIAgent.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
            orderBy,
          }),
          prisma.aIAgent.count({ where }),
        ])

        const pageCount = Math.ceil(total / input.perPage)

        return { data, pageCount }
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#aiAgents`],
    },
  )()
}
