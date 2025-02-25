import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { prisma } from "@ahachat.ai/database"
import type { AutomatedResponse, Flow, Prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type {
  GetAutomatedResponseSchema,
  ShowAutomatedResponseSchema,
} from "../schemas/get-automated-responses-schema"
import type { GetFlowSchema } from "../schemas/get-flow-schema"

export async function getAutomatedResponses(
  input: GetAutomatedResponseSchema,
): Promise<{ data: Array<AutomatedResponse>; pageCount: number }> {
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
              keyword: {
                contains: input.keyword,
                mode: "insensitive",
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
      } catch (err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 1,
      tags: [`${userId}#automatedResponse`],
    },
  )()
}

export async function showAutomatedResponses(
  input: ShowAutomatedResponseSchema,
): Promise<AutomatedResponse> {
  const userId = await getCurrentUserId()

  const where: Prisma.AutomatedResponseWhereInput = {
    id: input.id,
  }

  const [result] = await prisma.$transaction([
    prisma.automatedResponse.findFirst({
      where,
    }),
  ])

  return result as AutomatedResponse
}

export async function getActiveFlows(
  input: GetFlowSchema,
): Promise<{ data: Array<Flow> }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.FlowWhereInput = {
          chatbotId: input.chatbotId,
          active: true,
        }

        const [data] = await prisma.$transaction([
          prisma.flow.findMany({
            where,
          }),
        ])

        return { data }
      } catch (err) {
        return { data: [] }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 1,
      tags: [`${userId}#flows_for_automated_response`],
    },
  )()
}
