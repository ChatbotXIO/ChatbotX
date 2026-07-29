import { and, db, eq } from "@chatbotx.io/database/client"
import { conditionModel, webhookModel } from "@chatbotx.io/database/schema"
import type { WebhookModel } from "@chatbotx.io/database/types"
import { removeWebhookCache, updateWebhookCache } from "@chatbotx.io/events"
import { distributedLock } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { assertPublicUrl } from "../net/ssrf-guard"

export const MAX_WEBHOOKS_PER_WORKSPACE = 100
const LOCK_TIMEOUT_SECONDS = 30

export type WebhookConditionInput = {
  type: string
  sourceId?: string | null
  operator?: string | null
  value?: unknown
}

class WebhookService extends BaseService {
  async listByWorkspaceId(workspaceId: string): Promise<WebhookModel[]> {
    return await db
      .select()
      .from(webhookModel)
      .where(eq(webhookModel.workspaceId, workspaceId))
  }

  async register(props: {
    workspaceId: string
    name: string
    url: string
    conditions: WebhookConditionInput[]
  }): Promise<WebhookModel> {
    const { workspaceId, name, url, conditions } = props

    try {
      await assertPublicUrl(url, "Webhook URL")
    } catch (error) {
      throw new ChatbotXException(
        error instanceof Error ? error.message : "Invalid webhook URL",
        "invalidRequestData",
        422,
      )
    }

    const created = await distributedLock.runExclusive({
      key: `webhook:${workspaceId}`,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      fn: async () => {
        const count = await db.$count(
          webhookModel,
          eq(webhookModel.workspaceId, workspaceId),
        )
        if (count >= MAX_WEBHOOKS_PER_WORKSPACE) {
          throw new ChatbotXException(
            `Workspace has reached the maximum of ${MAX_WEBHOOKS_PER_WORKSPACE} webhooks`,
            "webhookLimitReached",
          )
        }

        return await db.transaction(async (tx) => {
          const [webhook] = await tx
            .insert(webhookModel)
            .values({ id: createId(), workspaceId, name, url })
            .returning()

          await tx.insert(conditionModel).values(
            conditions.map((condition) => ({
              id: createId(),
              webhookId: webhook.id,
              type: condition.type,
              sourceId: condition.sourceId ?? null,
              operator: condition.operator ?? null,
              value: condition.value ?? null,
            })),
          )

          return webhook
        })
      },
    })

    await updateWebhookCache(workspaceId)

    return created
  }

  async unregister(props: { workspaceId: string; id: string }): Promise<void> {
    const { workspaceId, id } = props

    const deleted = await db
      .delete(webhookModel)
      .where(
        and(eq(webhookModel.id, id), eq(webhookModel.workspaceId, workspaceId)),
      )
      .returning({ id: webhookModel.id })

    if (deleted.length === 0) {
      throw notFoundException("Webhook not found")
    }

    await removeWebhookCache(workspaceId)
  }
}

export const webhookService = new WebhookService()
