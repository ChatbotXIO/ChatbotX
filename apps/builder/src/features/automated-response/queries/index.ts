import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { ListAutomatedResponsesRequest } from "../schemas/get-automated-responses-schema"
import type { AutomatedResponseCollection } from "../schemas/types"

export async function getAutomatedResponses(
  input: ListAutomatedResponsesRequest,
): Promise<AutomatedResponseCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.AutomatedResponseWhereInput = {
        chatbotId: input.chatbotId,
      }

      if (input.keyword) {
        where.userMessages = {
          has: input.keyword,
        }
      }

      if (input.folderId && input.folderId.length > 0) {
        where.folderId = input.folderId
      }

      const [data, total] = await prisma.$transaction([
        prisma.automatedResponse.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
        }),
        prisma.automatedResponse.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    {
      revalidate: 1,
      tags: [`chatbots:${input.chatbotId}#automatedResponses`],
    },
  )()
}
