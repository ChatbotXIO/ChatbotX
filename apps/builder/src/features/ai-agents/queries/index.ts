"use server"

import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { aiAgentModel } from "@chatbotx.io/database/schema"
import type { AIAgentModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import type { ListAIAgentsRequest } from "@/features/ai-agents/schemas/query"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"

export async function listAIAgents(
  input: ListAIAgentsRequest,
): Promise<PaginatedResponse<AIAgentModel>> {
  const where = {
    workspaceId: input.workspaceId,
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
