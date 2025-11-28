import { type Prisma, prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { LogCollection } from "../schemas"
import type { GetLogsSchema } from "../schemas/get-logs-schema"

export async function getLogs(input: GetLogsSchema): Promise<LogCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

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
}
