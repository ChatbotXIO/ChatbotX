import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma } from "@ahachat.ai/database"
import type { Inbox, Prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { GetInboxesSchema } from "../schemas/get-inboxes-schema"

export async function listInboxes(
  input: GetInboxesSchema,
): Promise<{ data: Inbox[]; pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.InboxWhereInput = {
          chatbotId: input.chatbotId,
        }

        const [data, total] = await prisma.$transaction([
          prisma.inbox.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
          }),
          prisma.inbox.count({ where }),
        ])

        const pageCount = Math.ceil(total / input.perPage)

        return { data, pageCount }
      } catch (err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#inboxs`],
    },
  )()
}
