import { db } from "../../client"
import { triggerEventTypes } from "../../partials/trigger"

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
