"use server"

import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { aiAgentModel } from "@aha.chat/database/schema"
import type { AIAgentModel } from "@aha.chat/database/types"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import type { ListAIAgentsRequest } from "@/features/ai-agents/schemas/query"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"

export async function listAIAgents(
  input: ListAIAgentsRequest,
): Promise<PaginatedResponse<AIAgentModel>> {
  const where = {
    chatbotId: input.chatbotId,
    name: input.name
      ? {
          ilike: `%${input.name.toLowerCase()}%`,
        }
      : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(aiAgentModel, input)

  const [data, total] = await Promise.all([
    db.query.aiAgentModel.findMany({
      where,
      orderBy,
      limit: pagination.limit,
      offset: pagination.offset,
    }),
    db.$count(aiAgentModel, relationsFilterToSQL(aiAgentModel, where)),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}
