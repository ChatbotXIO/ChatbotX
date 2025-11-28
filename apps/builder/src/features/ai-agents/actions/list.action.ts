import { type Prisma, prisma } from "@aha.chat/database"
import type { AIAgentModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import type { ListAIAgentsRequest } from "@/features/ai-agents/schemas/list.schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"

export async function getAIAgents(
  input: ListAIAgentsRequest,
): Promise<{ data: AIAgentModel[]; pageCount: number }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await unstable_cache(
    async () => {
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
    },
    [JSON.stringify(input)],
    calcCacheTags([`chatbots:${input.chatbotId}#aiAgents`]),
  )()
}
