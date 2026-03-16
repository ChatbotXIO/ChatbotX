import { and, count, db, eq, isNull } from "@aha.chat/database/client"
import { webhookModel } from "@aha.chat/database/schema"
import type { WebhookModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { WebhookCollection } from "../schemas"
import type { GetWebhooksSchema } from "../schemas/get-webhook-schema"

export async function getWebhooks(
  input: GetWebhooksSchema,
): Promise<WebhookCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  // Build SQL conditions
  const conditions = [eq(webhookModel.chatbotId, input.chatbotId)]

  if (input.folderId !== undefined) {
    const folderId =
      input.folderId === null || input.folderId === "0" ? null : input.folderId
    if (folderId === null) {
      conditions.push(isNull(webhookModel.folderId))
    } else {
      conditions.push(eq(webhookModel.folderId, folderId))
    }
  }

  if (input.name) {
    conditions.push(eq(webhookModel.name, input.name))
  }

  const whereClause = and(...conditions)

  // Execute queries - fetch webhooks with SQL builder, then load conditions
  const [webhooks, countResult] = await Promise.all([
    db
      .select()
      .from(webhookModel)
      .where(whereClause)
      .limit(input.perPage)
      .offset((input.page - 1) * input.perPage),
    db.select({ count: count() }).from(webhookModel).where(whereClause),
  ])

  // Load conditions for webhooks
  const webhookIds = webhooks.map((w) => w.id)
  const conditionsData =
    webhookIds.length > 0
      ? await db.query.conditionModel.findMany({
          where: { webhookId: { in: webhookIds } },
        })
      : []

  // Merge webhooks with conditions
  const data = webhooks.map((webhook) => ({
    ...webhook,
    conditions: conditionsData.filter((c) => c.webhookId === webhook.id),
  }))

  const total = countResult[0]?.count ?? 0
  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findWebhook(params: {
  id?: string
  chatbotId?: string
}): Promise<WebhookModel | null> {
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

  const result = await db.query.webhookModel.findFirst({
    where,
    with: {
      conditions: true,
    },
  })

  return result ?? null
}
