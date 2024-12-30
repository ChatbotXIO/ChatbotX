import { unstable_cache } from "next/cache";
import { GetLogsSchema } from "./get-logs-schema";
import { prisma } from "@ahachat.ai/database";
import { Prisma, Log } from "@prisma/client";
import { getCurrentUserId } from "@/auth";
import { findChatbotOrFail } from "@/lib/user-permissions";

export async function getLogs(input: GetLogsSchema): Promise<{ data: Log[], pageCount: number }> {
  const userId = await getCurrentUserId()

  return await unstable_cache(async () => {
    try {
      await findChatbotOrFail(userId, input.chatbotId)

      const where: Prisma.LogWhereInput = {
        chatbotId: input.chatbotId,
      }

      if (input.keyword) {
        where.OR = [
          {
            feature: {
              contains: input.keyword,
              mode: 'insensitive'
            }
          },
        ]
      }

      const [data, total] = await prisma.$transaction([
        prisma.log.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
        }),
        prisma.log.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    } catch (err) {
      return { data: [], pageCount: 0 }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: ['logs']
  })()
}
