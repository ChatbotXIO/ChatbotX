import { getCurrentUserId } from "@/auth"
import type { GetAITriggersSchema } from "@/features/integrations/ai-triggers/schemas/get.schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type AITrigger, type Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export const getAITriggers = async (
  input: GetAITriggersSchema,
): Promise<{
  data: AITrigger[]
  pageCount: number
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId as string)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.AITriggerWhereInput = {
          chatbotId: input.chatbotId,
        }

        if (input.name) {
          where.AND = [
            {
              // name: {
              //   contains: input.name,
              //   mode: "insensitive",
              // },
            },
          ]
        }

        let orderBy: Record<string, string>[]
        const page = input.page ? input.page - 1 : 1
        const perPage = input.perPage ? input.perPage : 10

        if (input.sort) {
          orderBy = input.sort.map((sortItem) => ({
            [sortItem.id]: sortItem.desc ? "desc" : "asc",
          }))
        }

        const [data, total] = await prisma.$transaction([
          prisma.aiTrigger.findMany({
            skip: page * perPage,
            take: perPage,
            where,
            orderBy,
          }),
          prisma.aiTrigger.count({ where }),
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
      tags: [`${userId}#aiTriggers`],
    },
  )()
}
