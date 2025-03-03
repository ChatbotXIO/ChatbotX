import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { Inbox, Prisma } from "@ahachat.ai/database"
import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { ListInboxesRequest } from "../schemas/list-inboxes.schema"

export async function listInboxes(
  input: ListInboxesRequest,
): Promise<{ data: Inbox[]; pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
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
          }),
          prisma.inbox.count({ where }),
        ])

        const pageCount = Math.ceil(total / take)

        return { data, pageCount }
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbot:${input.chatbotId}#inboxs`],
    },
  )()
}
