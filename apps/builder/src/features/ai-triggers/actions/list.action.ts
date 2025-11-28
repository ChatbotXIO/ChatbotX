import { type Prisma, prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import type {
  AITriggerCollection,
  ListAITriggersRequest,
} from "@/features/ai-triggers/schemas/get.schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"

export const listAITriggers = async (
  input: ListAITriggersRequest,
): Promise<AITriggerCollection> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.AITriggerWhereInput = {
        chatbotId: input.chatbotId,
      }

      let orderBy: Record<string, string>[] = []
      const page = input.page ? input.page - 1 : 1
      const perPage = input.perPage ? input.perPage : 10

      if (input.sort) {
        orderBy = input.sort.map((sortItem) => ({
          [sortItem.id]: sortItem.desc ? "desc" : "asc",
        }))
      }

      if (input.name) {
        where.name = {
          contains: input.name,
          mode: "insensitive",
        }
      }

      const [data, total] = await prisma.$transaction([
        prisma.aITrigger.findMany({
          skip: page * perPage,
          take: perPage,
          where,
          orderBy,
        }),
        prisma.aITrigger.count({ where }),
      ])

      const pageCount = Math.ceil(total / perPage)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    calcCacheTags([`chatbots:${input.chatbotId}#aiTriggers`]),
  )()
}
