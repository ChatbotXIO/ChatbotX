import { type Prisma, prisma } from "@aha.chat/database"
import { InboxStatus } from "@aha.chat/database/enums"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"
import type { InboxCollection } from "../schemas"
import type { ListInboxesRequest } from "../schemas/list-inboxes.schema"

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<InboxCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.InboxWhereInput = {
        chatbotId: input.chatbotId,
        status: InboxStatus.connected,
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
    calcCacheTags([`chatbots:${input.chatbotId}#inboxes`]),
  )()
}
