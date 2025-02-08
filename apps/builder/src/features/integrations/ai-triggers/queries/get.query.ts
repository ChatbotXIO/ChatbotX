import { type AiTrigger, type Prisma, prisma } from "@ahachat.ai/database"
import type { GetAiTriggersSchema } from "@/features/integrations/ai-triggers/schemas/get.schema"
import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { unstable_cache } from "next/cache"

export const getAiTriggers = async (
  input: GetAiTriggersSchema,
): Promise<{
  data: AiTrigger[]
  pageCount: number
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.AiTriggerWhereInput = {
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

        const orderBy = input.sort.map((sortItem) => ({
          [sortItem.id]: sortItem.desc ? "desc" : "asc",
        }))

        const [data, total] = await prisma.$transaction([
          prisma.aiTrigger.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
            orderBy,
          }),
          prisma.aiTrigger.count({ where }),
        ])

        const pageCount = Math.ceil(total / input.perPage)

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
