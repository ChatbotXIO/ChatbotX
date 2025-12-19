import { type Prisma, prisma } from "@aha.chat/database"
import type { BroadcastModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetBroadcastsSchema } from "../schemas/get-broadcasts-schema"

export async function listBroadcasts(
  input: GetBroadcastsSchema,
): Promise<{ data: BroadcastModel[]; pageCount: number }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.BroadcastWhereInput = {
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
  const orderBy = input.sort.map((sortItem) => {
    if ((sortItem.id as string) === "estimatedContacts") {
      return {
        contacts: {
          _count: sortItem.desc ? "desc" : "asc",
        },
      } as Prisma.BroadcastOrderByWithRelationInput
    }
    return {
      [sortItem.id]: sortItem.desc ? "desc" : "asc",
    } as Prisma.BroadcastOrderByWithRelationInput
  })

  const [data, total] = await prisma.$transaction([
    prisma.broadcast.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      orderBy,
      include: {
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    }),
    prisma.broadcast.count({ where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}
