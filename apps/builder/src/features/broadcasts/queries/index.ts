import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma } from "@ahachat.ai/database"
import type { Broadcast, Prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { GetBroadcastsSchema } from "../schemas/get-broadcasts-schema"

export async function listBroadcasts(
  input: GetBroadcastsSchema,
): Promise<{ data: Broadcast[]; pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
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
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#broadcasts`],
    },
  )()
}
