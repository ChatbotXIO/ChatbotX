import { and, count, type DatabaseClient, db, eq, isNull } from "../../client"
import { rootFolderId } from "../../partials"
import { triggerEventTypes } from "../../partials/trigger"
import { webhookModel } from "../../schema"

export type { DateTimeContactCustomFieldRow } from "../contact-custom-field"
export { listContactCustomFieldsForDateTimeSweep } from "../contact-custom-field"

export type DateTimeWebhookConditionRow = {
  sourceId: string | null
  type: string
  value: unknown
}

export type ActiveDateTimeWebhookRow = {
  conditions: DateTimeWebhookConditionRow[]
  id: string
  workspace: { timezone: string | null } | null
  workspaceId: string
}

export async function listActiveDateTimeWebhooks(params: {
  cursor?: string
  limit: number
}): Promise<{
  nextCursor: string | undefined
  webhooks: ActiveDateTimeWebhookRow[]
}> {
  const activeWebhooks = await db.query.webhookModel.findMany({
    where: {
      active: true,
      ...(params.cursor ? { id: { gt: params.cursor } } : {}),
    },
    with: {
      conditions: true,
      workspace: true,
    },
    limit: params.limit,
    orderBy: { id: "asc" },
  })

  const webhooks = activeWebhooks
    .map((webhook) => ({
      id: webhook.id,
      workspaceId: webhook.workspaceId,
      workspace: webhook.workspace,
      conditions: webhook.conditions.filter(
        (condition) =>
          condition.type === triggerEventTypes.enum.dateTimeBasedTrigger,
      ),
    }))
    .filter((webhook) => webhook.conditions.length > 0)

  return {
    webhooks,
    nextCursor:
      activeWebhooks.length === params.limit
        ? activeWebhooks.at(-1)?.id
        : undefined,
  }
}

/**
 * Paginated webhook rows, SQL-builder style. Webhooks use `rootFolderId` as
 * the root-folder sentinel (unlike triggers, which use `""`) — preserve each
 * verbatim, do not unify them.
 */
export async function listWebhooksPaginated(
  input: {
    workspaceId: string
    folderId?: string | null
    name?: string
    limit: number
    offset: number
  },
  tx: DatabaseClient = db,
): Promise<{ rows: (typeof webhookModel.$inferSelect)[]; total: number }> {
  const conditions = [eq(webhookModel.workspaceId, input.workspaceId)]

  if (input.folderId !== undefined) {
    const folderId =
      input.folderId === null || input.folderId === rootFolderId
        ? null
        : input.folderId
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

  const [rows, countResult] = await Promise.all([
    tx
      .select()
      .from(webhookModel)
      .where(whereClause)
      .limit(input.limit)
      .offset(input.offset),
    tx.select({ count: count() }).from(webhookModel).where(whereClause),
  ])

  return { rows, total: countResult[0]?.count ?? 0 }
}

export async function findWebhookWithConditions(
  params: { id?: string; workspaceId?: string },
  tx: DatabaseClient = db,
) {
  const where: Record<string, unknown> = {}

  if (params.id) {
    where.id = params.id
  }

  if (params.workspaceId) {
    where.workspaceId = params.workspaceId
  }

  if (Object.keys(where).length === 0) {
    return null
  }

  const result = await tx.query.webhookModel.findFirst({
    where,
    with: {
      conditions: true,
    },
  })

  return result ?? null
}
