"use server"

import { type Prisma, prisma } from "@aha.chat/database"
import type { AIAgentModel } from "@aha.chat/database/types"
import type { ListAIAgentsRequest } from "@/features/ai-agents/schemas/query"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"

export async function getAIAgents(
  input: ListAIAgentsRequest,
): Promise<PaginatedResponse<AIAgentModel>> {
  const where: Prisma.AIAgentWhereInput = {
    chatbotId: input.chatbotId,
  }

  if (input.name) {
    where.name = {
      contains: input.name,
      mode: "insensitive",
    }
  }

  const orderBy = input.sort.map((sortItem) => ({
    [sortItem.id]: sortItem.desc ? "desc" : "asc",
  }))

  const [data, total] = await prisma.$transaction([
    prisma.aIAgent.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      orderBy,
    }),
    prisma.aIAgent.count({ where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}
