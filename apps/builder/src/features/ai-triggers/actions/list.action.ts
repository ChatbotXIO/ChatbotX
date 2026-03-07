import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { aiTriggerModel } from "@aha.chat/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import type {
  AITriggerCollection,
  ListAITriggersRequest,
} from "@/features/ai-triggers/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const listAITriggers = async (
  input: ListAITriggersRequest,
): Promise<AITriggerCollection> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
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
