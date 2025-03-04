import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { Prisma } from "@ahachat.ai/database"
import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type {
  AutomatedResponseCollection,
  AutomatedResponseResource,
  FindAutomatedResponseRequest,
  ListAutomatedResponsesRequest,
} from "../schemas/get-automated-responses-schema"

export async function getAutomatedResponses(
  input: ListAutomatedResponsesRequest,
): Promise<AutomatedResponseCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.AutomatedResponseWhereInput = {
          chatbotId: input.chatbotId,
        }

        if (input.keyword) {
          where.OR = [
            {
              userMessages: {
                has: input.keyword,
              },
            },
          ]
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
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 1,
      tags: [`chatbot:${input.chatbotId}#automatedResponses`],
    },
  )()
}

export async function showAutomatedResponses(
  input: FindAutomatedResponseRequest,
): Promise<AutomatedResponseResource> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await prisma.automatedResponse.findFirstOrThrow({
    where: input,
  })
}
