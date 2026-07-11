import { createId } from "@chatbotx.io/utils"
import { db, sql } from "../../client"
import { webhookExecutionModel } from "../../schema"

export async function listExecutedWebhookPairs(params: {
  contactIds: string[]
  webhookIds: string[]
}): Promise<Set<string>> {
  if (params.contactIds.length === 0 || params.webhookIds.length === 0) {
    return new Set()
  }

  const executions = await db.query.webhookExecutionModel.findMany({
    where: {
      webhookId: { in: params.webhookIds },
      contactId: { in: params.contactIds },
    },
    columns: {
      webhookId: true,
      contactId: true,
    },
  })

  return new Set(
    executions.map(
      (execution) => `${execution.webhookId}:${execution.contactId}`,
    ),
  )
}

export async function markWebhookExecuted(params: {
  contactId: string
  webhookId: string
  workspaceId: string
}): Promise<void> {
  await db
    .insert(webhookExecutionModel)
    .values({
      id: createId(),
      contactId: params.contactId,
      webhookId: params.webhookId,
      workspaceId: params.workspaceId,
      createdAt: new Date(),
      executedAt: new Date(),
    })
    .onConflictDoNothing()
}

export async function cleanupOldWebhookExecutions(
  olderThan: Date,
): Promise<number> {
  const result = await db.execute(
    sql`DELETE FROM "WebhookExecution" WHERE "executedAt" < ${olderThan}`,
  )

  return Number(result.rowCount ?? 0)
}
