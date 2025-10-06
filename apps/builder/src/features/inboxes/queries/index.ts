import { type Prisma, prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { InboxCollection } from "../schemas"
import type { ListInboxesRequest } from "../schemas/list-inboxes.schema"

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<InboxCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.InboxWhereInput = {
        chatbotId: input.chatbotId,
      }

      const take = input.perPage || 10
      const skip = (input.page ?? 1 - 1) * take
      const [data, total] = await prisma.$transaction([
        prisma.inbox.findMany({
          skip,
          take,
          where,
          include: input.includes?.includes("intergration")
            ? {
                integrationWhatsapp: true,
                integrationWebchat: true,
                integrationMessenger: true,
                integrationZalo: true,
              }
            : undefined,
        }),
        prisma.inbox.count({ where }),
      ])

      const pageCount = Math.ceil(total / take)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#inboxes`],
    },
  )()
}
