import { and, count, db, eq, isNull } from "@aha.chat/database/client"
import { triggerModel } from "@aha.chat/database/schema"
import type { TriggerModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { TriggerCollection } from "../schemas"
import type { GetTriggersSchema } from "../schemas/get-trigger-schema"

export async function getTriggers(
  input: GetTriggersSchema,
): Promise<TriggerCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  // Build SQL conditions
  const conditions = [eq(triggerModel.chatbotId, input.chatbotId)]

  if (input.folderId !== undefined) {
    const folderId =
      input.folderId === null || input.folderId === "0" ? null : input.folderId
    if (folderId === null) {
      conditions.push(isNull(triggerModel.folderId))
    } else {
      conditions.push(eq(triggerModel.folderId, folderId))
    }
  }

  if (input.name) {
    conditions.push(eq(triggerModel.name, input.name))
  }

  const whereClause = and(...conditions)

  // Execute queries - fetch triggers with SQL builder, then load conditions
  const [triggers, countResult] = await Promise.all([
    db
      .select()
      .from(triggerModel)
      .where(whereClause)
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage),
    db.select({ count: count() }).from(triggerModel).where(whereClause),
  ])

  // Load conditions for triggers
  const triggerIds = triggers.map((t) => t.id)
  const conditionsData =
    triggerIds.length > 0
      ? await db.query.conditionModel.findMany({
          where: { triggerId: { in: triggerIds } },
        })
      : []

  // Merge triggers with conditions
  const data = triggers.map((trigger) => ({
    ...trigger,
    conditions: conditionsData.filter((c) => c.triggerId === trigger.id),
  }))

  const total = countResult[0]?.count ?? 0
  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findTrigger(params: {
  id?: string
  chatbotId?: string
}): Promise<TriggerModel | null> {
  const where: Record<string, unknown> = {}

  if (params.id) {
    where.id = params.id
  }

  if (params.chatbotId) {
    where.chatbotId = params.chatbotId
  }

  if (Object.keys(where).length === 0) {
    return null
  }

  const result = await db.query.triggerModel.findFirst({
    where,
    with: {
      conditions: true,
    },
  })

  return result ?? null
}
