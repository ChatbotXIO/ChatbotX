import { type Prisma, prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { LogCollection } from "../schemas"
import type { GetLogsSchema } from "../schemas/get-logs-schema"

export async function getLogs(input: GetLogsSchema): Promise<LogCollection> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
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
            user: true,
            contact: true,
          },
        }),
        prisma.log.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#logs#${input.logType}`],
    },
  )()
}
