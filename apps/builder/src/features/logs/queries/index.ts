import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Log, type Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { GetLogsSchema } from "../schemas/get-logs-schema"

export async function getLogs(
  input: GetLogsSchema,
): Promise<{ data: Log[]; pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.LogWhereInput = {
          chatbotId: input.chatbotId,
          logType: input.logType,
        }

        if (input.action) {
          where.AND = [
            {
              action: {
                contains: input.action,
                mode: "insensitive",
              },
            },
          ]
        }

        const orderBy = input.sort.map((sortItem) => ({
          [sortItem.id]: sortItem.desc ? "desc" : "asc",
        }))

        const [data, total] = await prisma.$transaction([
          prisma.log.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
            orderBy,
            include: {
              executorUser: true,
              executorContact: true,
            },
          }),
          prisma.log.count({ where }),
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
      tags: [`${userId}#logs#${input.logType}`],
    },
  )()
}
