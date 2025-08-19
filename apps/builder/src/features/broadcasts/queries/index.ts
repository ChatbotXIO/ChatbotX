import { type Prisma, prisma } from "@aha.chat/database"
import type { BroadcastModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { GetBroadcastsSchema } from "../schemas/get-broadcasts-schema"

export async function listBroadcasts(
  input: GetBroadcastsSchema,
): Promise<{ data: BroadcastModel[]; pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.BroadcastWhereInput = {
        chatbotId: input.chatbotId,
      }

      const [data, total] = await prisma.$transaction([
        prisma.broadcast.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
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
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#broadcasts`],
    },
  )()
}
