import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import type {
  AITriggerCollection,
  ListAITriggersRequest,
} from "@/features/ai-triggers/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listAITriggers = async (
  input: ListAITriggersRequest,
): Promise<AITriggerCollection> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
    name: input.name
      ? {
          ilike: `%${input.name.toLowerCase()}%`,
        }
      : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(aiTriggerModel, input)

  const [data, total] = await Promise.all([
    db.query.aiTriggerModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(aiTriggerModel, relationsFilterToSQL(aiTriggerModel, where)),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}
