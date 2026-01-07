import { type Prisma, prisma } from "@aha.chat/database"
import type { TriggerModel, TriggerWhereInput } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { TriggerCollection } from "../schemas"
import type { GetTriggersSchema } from "../schemas/get-trigger-schema"

export async function getTriggers(
  input: GetTriggersSchema,
): Promise<TriggerCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.TriggerWhereInput = {
    chatbotId: input.chatbotId,
  }

  if (input.folderId !== undefined) {
    where.folderId =
      input.folderId === null || input.folderId === "0" ? null : input.folderId
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

  const orderBy = input.sort.map((sortItem) => {
    if ((sortItem.id as string) === "contacts") {
      return {
        contacts: {
          _count: sortItem.desc ? "desc" : "asc",
        },
      } as Prisma.TriggerOrderByWithRelationInput
    }
    return {
      [sortItem.id]: sortItem.desc ? "desc" : "asc",
    } as Prisma.TriggerOrderByWithRelationInput
  })

  const [data, total] = await prisma.$transaction([
    prisma.trigger.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      orderBy,
      include: {
        triggerConditions: true,
      },
    }),
    prisma.trigger.count({ where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findTrigger(
  where: TriggerWhereInput,
): Promise<TriggerModel | null> {
  return await prisma.trigger.findFirst({
    where,
    include: {
      triggerConditions: true,
    },
  })
}
