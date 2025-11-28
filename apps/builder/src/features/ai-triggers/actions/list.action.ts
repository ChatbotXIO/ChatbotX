import { type Prisma, prisma } from "@aha.chat/database"
import type {
  AITriggerCollection,
  ListAITriggersRequest,
} from "@/features/ai-triggers/schemas/get.schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listAITriggers = async (
  input: ListAITriggersRequest,
): Promise<AITriggerCollection> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

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
}
